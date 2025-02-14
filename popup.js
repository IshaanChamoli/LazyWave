const clientId = '264a5ade3f104c2f9419ff2e0fcf307b';
const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/callback`;

// Add more detailed logging
console.log('Extension ID:', chrome.runtime.id);
console.log('Full Redirect URI:', redirectUri);

// Add this line at the start of your file to see the exact URI
console.log('Please add this redirect URI to Spotify Dashboard:', redirectUri);

// Add this line to see the exact redirect URI you need to register
console.log('Redirect URI:', redirectUri);

// Generate a random string for PKCE
function generateCodeVerifier(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Generate code challenge from verifier
async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

// Add this at the top of popup.js with other state variables
let isExtensionActive = true;

// Replace the initializeToggleHandler function
function initializeToggleHandler() {
    const toggleButton = document.getElementById('toggle-extension');
    if (!toggleButton) return;

    toggleButton.addEventListener('click', async () => {
        const container = document.querySelector('.container');
        const toggleText = toggleButton.querySelector('.toggle-text');
        const toggleIcon = toggleButton.querySelector('i');
        
        // Toggle the extension state
        isExtensionActive = !isExtensionActive;
        
        // Store the state
        await chrome.storage.local.set({ 'extension_active': isExtensionActive });
        
        if (!isExtensionActive) {
            // Disable functionality
            container.classList.add('disabled');
            toggleText.textContent = 'Enable Extension';
            toggleIcon.style.color = '#1DB954';
            
            // Clear any existing intervals
            if (window.nowPlayingInterval) clearInterval(window.nowPlayingInterval);
            if (window.browserAudioInterval) clearInterval(window.browserAudioInterval);
            
            // Tell background script to pause checking
            chrome.runtime.sendMessage({ action: "pauseChecking" });
        } else {
            // Re-enable functionality
            container.classList.remove('disabled');
            toggleText.textContent = 'Disable Extension';
            toggleIcon.style.color = '#ff4444';
            
            // Restart the extension
            window.location.reload();
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const container = document.querySelector('.container');
    const loginButton = document.getElementById('login-button');
    
    // Check if extension is active first
    const { extension_active = true } = await chrome.storage.local.get('extension_active');
    isExtensionActive = extension_active;
    
    if (!isExtensionActive) {
        // Hide everything except the disabled message and settings
        loginButton.style.display = 'none';
        container.classList.add('disabled');
        const toggleText = document.querySelector('.toggle-text');
        const toggleIcon = document.querySelector('#toggle-extension i');
        if (toggleText) toggleText.textContent = 'Enable Extension';
        if (toggleIcon) toggleIcon.style.color = '#1DB954';
        
        // Only initialize the toggle handler and settings icon click
        initializeToggleHandler();
        initializeSettingsIcon();
        return; // Don't initialize anything else
    }
    
    // Normal initialization for enabled state
    initializeToggleHandler();
    initializeSettingsIcon();
    
    const token = await getAccessToken();
    if (token) {
        loginButton.style.display = 'none';
        container.classList.add('logged-in');
        
        checkNowPlaying();
        window.nowPlayingInterval = setInterval(checkNowPlaying, 1000);
        
        checkBrowserAudio();
        window.browserAudioInterval = setInterval(checkBrowserAudio, 1000);
    } else {
        loginButton.style.display = 'block';
        container.classList.remove('logged-in');
    }
});

// Separate function for settings icon initialization
function initializeSettingsIcon() {
    const settingsIcon = document.querySelector('.settings-icon');
    const settingsCard = document.querySelector('.settings-card');
    
    settingsIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsCard.classList.toggle('visible');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.settings-card') && !e.target.closest('.settings-icon')) {
            settingsCard.classList.remove('visible');
        }
    });
}

let isPlaying = false;
let wasAutoPaused = false;

// Add the refreshTokenIfNeeded function
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
                    client_id: clientId,
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

// Update getAccessToken to use refresh mechanism
async function getAccessToken() {
    try {
        return await refreshTokenIfNeeded();
    } catch (error) {
        console.error('Error getting access token:', error);
        return null;
    }
}

// Update pauseSpotify function
async function pauseSpotify() {
    try {
        const accessToken = await refreshTokenIfNeeded();
        if (!accessToken) return;

        const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.ok) {
            isPlaying = false;
            wasAutoPaused = true;
        } else if (response.status === 401) {
            // Token might be invalid, clear it
            await chrome.storage.local.remove([
                'spotify_access_token',
                'spotify_refresh_token',
                'spotify_token_expiry'
            ]);
        }
    } catch (error) {
        console.error('Error pausing Spotify:', error);
    }
}

// Update playSpotify function
async function playSpotify() {
    try {
        const accessToken = await refreshTokenIfNeeded();
        if (!accessToken) return;

        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.ok) {
            isPlaying = true;
        } else if (response.status === 401) {
            // Token might be invalid, clear it
            await chrome.storage.local.remove([
                'spotify_access_token',
                'spotify_refresh_token',
                'spotify_token_expiry'
            ]);
        }
    } catch (error) {
        console.error('Error playing Spotify:', error);
    }
}

// Update checkNowPlaying function
async function checkNowPlaying() {
    try {
        const accessToken = await refreshTokenIfNeeded();
        if (!accessToken) return;

        const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        // Handle 401 Unauthorized specifically
        if (response.status === 401) {
            await chrome.storage.local.remove([
                'spotify_access_token',
                'spotify_refresh_token',
                'spotify_token_expiry'
            ]);
            // Show login button
            document.getElementById('login-button').style.display = 'block';
            document.querySelector('.container').classList.remove('logged-in');
            return;
        }

        // If no active device or no data
        if (response.status === 204 || response.status === 404) {
            const elements = {
                nowPlaying: document.getElementById('now-playing'),
                trackName: document.getElementById('track-name'),
                artistName: document.getElementById('artist-name'),
                albumArt: document.getElementById('album-art'),
                backgroundArt: document.querySelector('.background-art')
            };

            if (elements.nowPlaying) {
                elements.nowPlaying.style.display = 'block';
                elements.trackName.innerHTML = '<a href="#" class="spotify-link">Open Spotify Desktop</a>';
                elements.trackName.classList.add('instruction');
                elements.artistName.textContent = 'Start playing music to see it here';
                elements.artistName.classList.add('instruction');
                elements.albumArt.src = 'icon128.png';
                elements.backgroundArt.style.backgroundImage = 'none';

                // Add click handler for the Spotify link
                const spotifyLink = elements.trackName.querySelector('.spotify-link');
                if (spotifyLink) {
                    spotifyLink.addEventListener('click', async (e) => {
                        e.preventDefault();
                        try {
                            // This will work because it's within a user gesture (click)
                            await chrome.tabs.update({ url: 'spotify://' });
                        } catch (error) {
                            console.error('Failed to open Spotify:', error);
                        }
                    });
                }
            }
            return;
        }

        const data = await response.json();
        if (data && data.item) {
            const elements = {
                nowPlaying: document.getElementById('now-playing'),
                trackName: document.getElementById('track-name'),
                artistName: document.getElementById('artist-name'),
                albumArt: document.getElementById('album-art'),
                backgroundArt: document.querySelector('.background-art')
            };

            // Check if all elements exist
            if (!Object.values(elements).every(el => el)) {
                console.error('Some elements not found in the DOM');
                return;
            }

            elements.nowPlaying.style.display = 'block';
            elements.trackName.textContent = data.item.name;
            elements.artistName.textContent = data.item.artists.map(artist => artist.name).join(', ');
            elements.albumArt.onload = function() {
                this.classList.add('loaded');
            };
            elements.albumArt.src = data.item.album.images[0].url;
            elements.backgroundArt.style.backgroundImage = `url(${data.item.album.images[0].url})`;
            
            // Update playing state and reset auto-pause flag if user manually changed state
            if (isPlaying !== data.is_playing) {
                isPlaying = data.is_playing;
                if (!data.is_playing) {
                    wasAutoPaused = false; // User manually paused
                }
            }

            // Add status message if Spotify was auto-paused
            const audioState = await chrome.runtime.sendMessage({ action: "getAudioState" });
            if (audioState.isPlaying && !data.is_playing && wasAutoPaused) {
                elements.trackName.textContent += ' (Auto-paused)';
            }

            // Update play indicator
            const playIndicator = document.querySelector('.play-indicator');
            if (data.is_playing) {
                playIndicator.classList.add('playing');
            } else {
                playIndicator.classList.remove('playing');
            }
        } else {
            const elements = {
                nowPlaying: document.getElementById('now-playing'),
                trackName: document.getElementById('track-name'),
                artistName: document.getElementById('artist-name')
            };

            if (elements.nowPlaying) {
                elements.nowPlaying.style.display = 'block';
                elements.trackName.innerHTML = '<a href="#" class="spotify-link">Open Spotify Desktop</a>';
                elements.trackName.classList.add('instruction');
                elements.artistName.textContent = 'Start playing music to see it here';
                elements.artistName.classList.add('instruction');
            }
        }
    } catch (error) {
        console.error('Error in checkNowPlaying:', error);
        // Show error message in the UI
        const elements = {
            nowPlaying: document.getElementById('now-playing'),
            trackName: document.getElementById('track-name'),
            artistName: document.getElementById('artist-name')
        };

        if (elements.nowPlaying) {
            elements.nowPlaying.style.display = 'block';
            elements.trackName.textContent = 'Connection error';
            elements.artistName.textContent = 'Please check Spotify connection';
        }
    }
}

document.getElementById('login-button').addEventListener('click', async () => {
    const codeVerifier = generateCodeVerifier(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    const state = generateCodeVerifier(16);
    const scope = 'user-read-playback-state user-modify-playback-state';

    const args = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: scope,
        redirect_uri: redirectUri,
        state: state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        show_dialog: true
    });

    const authUrl = 'https://accounts.spotify.com/authorize?' + args;

    try {
        const responseUrl = await new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome Runtime Error:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (!response) {
                    console.error('No response received from auth flow');
                    reject(new Error('No response received from authorization'));
                } else {
                    console.log('Auth flow completed successfully');
                    resolve(response);
                }
            });
        });

        if (!responseUrl) {
            throw new Error('No response URL');
        }

        const url = new URL(responseUrl);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');

        if (state !== returnedState) {
            throw new Error('State mismatch');
        }

        if (!code) {
            throw new Error('No code received');
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        });

        const data = await tokenResponse.json();
        
        if (data.error) {
            throw new Error(`Token error: ${data.error}`);
        }

        await chrome.storage.local.set({
            'spotify_access_token': data.access_token,
            'spotify_refresh_token': data.refresh_token,
            'spotify_token_expiry': Date.now() + (data.expires_in * 1000)
        });

        if (data.access_token) {
            const container = document.querySelector('.container');
            const loginButton = document.getElementById('login-button');
            
            loginButton.style.display = 'none';
            container.classList.add('logged-in');
            
            checkNowPlaying();
            
            // Start the audio checks only after successful login
            checkBrowserAudio();
            setInterval(checkBrowserAudio, 1000);
        }

    } catch (error) {
        console.error('Detailed authentication error:', error);
        console.error('Auth URL attempted:', authUrl);
        alert(`Authentication failed: ${error.message}\nPlease check the console for more details.`);
    }
});

// Add browser audio detection
const audioStatusElement = document.getElementById('browser-audio-status');

function updateAudioUI(audioState) {
    const spotifySection = document.querySelector('.spotify-section');

    if (audioState.isPlaying) {
        // Truncate long titles but keep format
        const maxLength = 40;
        const truncatedTitle = audioState.tabTitle.length > maxLength 
            ? audioState.tabTitle.substring(0, maxLength) + '...' 
            : audioState.tabTitle;
            
        audioStatusElement.textContent = `Playing audio: ${truncatedTitle}`;
        audioStatusElement.classList.add('audio-playing');
        audioStatusElement.classList.remove('audio-silent');
        document.querySelector('.audio-wave').style.opacity = '0.15';
        
        // Dim Spotify section
        spotifySection.classList.add('dimmed');
    } else {
        audioStatusElement.textContent = 'No browser audio playing';
        audioStatusElement.classList.add('audio-silent');
        audioStatusElement.classList.remove('audio-playing');
        document.querySelector('.audio-wave').style.opacity = '0.1';
        
        // Remove dim from Spotify section
        spotifySection.classList.remove('dimmed');
    }
}

// Update checkBrowserAudio to remove toggle check
async function checkBrowserAudio() {
    try {
        const response = await chrome.runtime.sendMessage({ action: "getAudioState" });
        updateAudioUI(response);

        if (response.isPlaying) {
            await pauseSpotify();
        } else if (wasAutoPaused && isPlaying) {
            await playSpotify();
            wasAutoPaused = false;
        }
    } catch (error) {
        console.error('Error checking browser audio:', error);
        audioStatusElement.textContent = 'Error checking audio status';
    }
} 