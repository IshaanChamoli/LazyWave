let currentAudioState = {
    isPlaying: false,
    tabTitle: '',
    tabId: null,
    lastStateChange: Date.now()
};

let spotifyPlaybackState = false;

// Function to update extension icon and badge
async function updateExtensionIcon() {
    try {
        // Update badge based on Spotify playback state
        if (spotifyPlaybackState) {
            chrome.action.setBadgeText({ text: "❚❚" });
            chrome.action.setBadgeBackgroundColor({ color: "#1DB954" });
            chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
        } else {
            chrome.action.setBadgeText({ text: "►" });
            chrome.action.setBadgeBackgroundColor({ color: "#1DB954" });
            chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
        }
    } catch (error) {
        console.error('Error updating icon:', error);
    }
}

// Function to control Spotify playback
async function controlSpotifyPlayback(shouldPlay) {
    try {
        const result = await chrome.storage.local.get(['spotify_access_token']);
        const accessToken = result.spotify_access_token;
        
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
        }
    } catch (error) {
        console.error('Error controlling Spotify:', error);
    }
}

// Add function to check Spotify state
async function checkSpotifyState() {
    try {
        const result = await chrome.storage.local.get(['spotify_access_token']);
        const accessToken = result.spotify_access_token;
        
        if (!accessToken) return;

        const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 204) {
            spotifyPlaybackState = false;
        } else {
            const data = await response.json();
            spotifyPlaybackState = data?.is_playing || false;
        }

        updateExtensionIcon();
    } catch (error) {
        console.error('Error checking Spotify state:', error);
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

// Start checking both states
checkAudioStatus();
checkSpotifyState();
setInterval(checkAudioStatus, 1000);
setInterval(checkSpotifyState, 1000);

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getAudioState") {
        sendResponse(currentAudioState);
    }
    return true;
}); 