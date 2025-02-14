let currentAudioState = {
    isPlaying: false,
    tabTitle: '',
    tabId: null,
    lastStateChange: Date.now()
};

let spotifyPlaybackState = false;
let isCheckingPaused = false;
let audioInterval = null;
let spotifyInterval = null;  // Store intervals in global variables instead of window

// Function to update extension icon and badge
async function updateExtensionIcon() {
    try {
        if (isCheckingPaused) {
            // Show red exclamation mark when disabled
            chrome.action.setBadgeText({ text: "!" });
            chrome.action.setBadgeBackgroundColor({ color: "#ff4444" });
            chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
        } else {
            // Normal Spotify state badges
            if (spotifyPlaybackState) {
                chrome.action.setBadgeText({ text: "❚❚" });
                chrome.action.setBadgeBackgroundColor({ color: "#1DB954" });
                chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
            } else {
                chrome.action.setBadgeText({ text: "►" });
                chrome.action.setBadgeBackgroundColor({ color: "#1DB954" });
                chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
            }
        }
    } catch (error) {
        console.error('Error updating icon:', error);
    }
}

// Add this function to handle token refresh
async function refreshTokenIfNeeded() {
    try {
        const storage = await chrome.storage.local.get([
            'spotify_access_token',
            'spotify_refresh_token',
            'spotify_token_expiry'
        ]);

        const now = Date.now();
        // Check if token is expired or will expire in the next minute
        if (storage.spotify_token_expiry && now >= storage.spotify_token_expiry - 60000) {
            if (!storage.spotify_refresh_token) {
                throw new Error('No refresh token available');
            }

            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: storage.spotify_refresh_token,
                    client_id: '264a5ade3f104c2f9419ff2e0fcf307b',
                }),
            });

            const data = await response.json();
            if (data.error) {
                throw new Error(`Token refresh error: ${data.error}`);
            }

            // Store new tokens
            await chrome.storage.local.set({
                'spotify_access_token': data.access_token,
                'spotify_token_expiry': Date.now() + (data.expires_in * 1000)
            });

            // If a new refresh token was provided, store it
            if (data.refresh_token) {
                await chrome.storage.local.set({
                    'spotify_refresh_token': data.refresh_token
                });
            }

            return data.access_token;
        }

        return storage.spotify_access_token;
    } catch (error) {
        console.error('Error refreshing token:', error);
        // Clear tokens if refresh failed
        await chrome.storage.local.remove([
            'spotify_access_token',
            'spotify_refresh_token',
            'spotify_token_expiry'
        ]);
        throw error;
    }
}

// Function to control Spotify playback
async function controlSpotifyPlayback(shouldPlay) {
    try {
        const accessToken = await refreshTokenIfNeeded();
        if (!accessToken) return;

        const endpoint = shouldPlay ? 'play' : 'pause';
        const response = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 404) {
            console.log('No active Spotify device found');
        } else if (response.status === 401) {
            // Token might be invalid, clear it
            await chrome.storage.local.remove([
                'spotify_access_token',
                'spotify_refresh_token',
                'spotify_token_expiry'
            ]);
        }
    } catch (error) {
        console.error('Error controlling Spotify:', error);
    }
}

// Update checkSpotifyState to use token refresh
async function checkSpotifyState() {
    try {
        const accessToken = await refreshTokenIfNeeded();
        if (!accessToken) return;

        const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 204) {
            spotifyPlaybackState = false;
        } else if (response.status === 401) {
            // Token might be invalid, clear it
            await chrome.storage.local.remove([
                'spotify_access_token',
                'spotify_refresh_token',
                'spotify_token_expiry'
            ]);
            spotifyPlaybackState = false;
        } else {
            const data = await response.json();
            spotifyPlaybackState = data?.is_playing || false;
        }

        updateExtensionIcon();
    } catch (error) {
        console.error('Error checking Spotify state:', error);
        spotifyPlaybackState = false;
        updateExtensionIcon();
    }
}

async function checkAudioStatus() {
    try {
        const tabs = await chrome.tabs.query({});
        let isPlayingInAnyTab = false;
        let playingTabTitle = '';
        let playingTabId = null;

        for (const tab of tabs) {
            if (tab.audible) {
                isPlayingInAnyTab = true;
                playingTabTitle = tab.title;
                playingTabId = tab.id;
                break;
            }
        }

        // Check if state has changed
        if (isPlayingInAnyTab !== currentAudioState.isPlaying) {
            // Control Spotify based on audio state
            if (isPlayingInAnyTab) {
                await controlSpotifyPlayback(false);
            } else {
                await controlSpotifyPlayback(true);
            }
            
            currentAudioState.lastStateChange = Date.now();
        }

        currentAudioState = {
            isPlaying: isPlayingInAnyTab,
            tabTitle: playingTabTitle,
            tabId: playingTabId,
            lastStateChange: currentAudioState.lastStateChange
        };

        // Check Spotify state after controlling playback
        await checkSpotifyState();

    } catch (error) {
        console.error('Error checking audio status:', error);
    }
}

// Update the startChecking function
function startChecking() {
    // Clear any existing intervals first
    if (audioInterval) clearInterval(audioInterval);
    if (spotifyInterval) clearInterval(spotifyInterval);
    
    // Reset states
    currentAudioState = {
        isPlaying: false,
        tabTitle: '',
        tabId: null,
        lastStateChange: Date.now()
    };
    
    // Start fresh checks
    checkAudioStatus();
    checkSpotifyState();
    
    if (!isCheckingPaused) {
        audioInterval = setInterval(() => {
            if (!isCheckingPaused) checkAudioStatus();
        }, 1000);
        
        spotifyInterval = setInterval(() => {
            if (!isCheckingPaused) checkSpotifyState();
        }, 1000);
    }
}

// Update message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getAudioState") {
        sendResponse(currentAudioState);
    }
    if (request.action === "pauseChecking") {
        isCheckingPaused = true;
        // Reset states
        currentAudioState = {
            isPlaying: false,
            tabTitle: '',
            tabId: null,
            lastStateChange: Date.now()
        };
        spotifyPlaybackState = false;
        updateExtensionIcon();
        
        // Clear intervals
        if (audioInterval) clearInterval(audioInterval);
        if (spotifyInterval) clearInterval(spotifyInterval);
        audioInterval = null;
        spotifyInterval = null;
    }
    if (request.action === "resumeChecking") {
        isCheckingPaused = false;
        startChecking();
        sendResponse({ success: true });
    }
    return true;
});

// Initialize checking
chrome.storage.local.get('extension_active', ({ extension_active = true }) => {
    isCheckingPaused = !extension_active;
    if (extension_active) {
        startChecking();
    }
}); 