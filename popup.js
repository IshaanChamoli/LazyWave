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

        checkNowPlaying();
        document.getElementById('login-button').style.display = 'none';
        document.getElementById('now-playing').style.display = 'block';

    } catch (error) {
        console.error('Detailed authentication error:', error);
        console.error('Auth URL attempted:', authUrl);
        alert(`Authentication failed: ${error.message}\nPlease check the console for more details.`);
    }
});

let isPlaying = false;

async function getAccessToken() {
    const result = await chrome.storage.local.get(['spotify_access_token']);
    return result.spotify_access_token;
}

async function togglePlayPause() {
    const accessToken = await getAccessToken();
    const button = document.getElementById('play-pause-button');
    const icon = button.querySelector('i');
    
    if (!accessToken) return;

    try {
        if (!isPlaying) {
            const response = await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.status === 404) {
                alert('No active device found. Please open Spotify first.');
            } else if (response.ok) {
                isPlaying = true;
                icon.className = 'fas fa-pause';
            }
        } else {
            const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.ok) {
                isPlaying = false;
                icon.className = 'fas fa-play';
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function checkNowPlaying() {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    try {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 204) {
            document.getElementById('now-playing').style.display = 'none';
            return;
        }

        const data = await response.json();
        if (data && data.item) {
            document.getElementById('now-playing').style.display = 'block';
            document.getElementById('track-name').textContent = data.item.name;
            document.getElementById('artist-name').textContent = data.item.artists.map(artist => artist.name).join(', ');
            document.getElementById('album-name').textContent = data.item.album.name;
            document.getElementById('album-art').src = data.item.album.images[0].url;
            
            const icon = document.querySelector('#play-pause-button i');
            if (icon) {
                isPlaying = data.is_playing;
                icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
            }

            // Add status message if Spotify was auto-paused
            const audioState = await chrome.runtime.sendMessage({ action: "getAudioState" });
            if (audioState.isPlaying && !data.is_playing) {
                document.getElementById('track-name').textContent += ' (Auto-paused)';
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const playPauseButton = document.getElementById('play-pause-button');
    if (playPauseButton) {
        playPauseButton.addEventListener('click', togglePlayPause);
    }

    const token = await getAccessToken();
    if (token) {
        document.getElementById('login-button').style.display = 'none';
        checkNowPlaying();
        setInterval(checkNowPlaying, 1000);
    } else {
        document.getElementById('login-button').style.display = 'block';
        document.getElementById('now-playing').style.display = 'none';
    }

    // Add browser audio detection
    const audioStatusElement = document.getElementById('browser-audio-status');

    function updateAudioUI(audioState) {
        if (audioState.isPlaying) {
            audioStatusElement.textContent = `Playing audio: ${audioState.tabTitle}`;
            audioStatusElement.classList.add('audio-playing');
            audioStatusElement.classList.remove('audio-silent');
        } else {
            audioStatusElement.textContent = 'No browser audio playing';
            audioStatusElement.classList.add('audio-silent');
            audioStatusElement.classList.remove('audio-playing');
        }
    }

    async function checkBrowserAudio() {
        try {
            const response = await chrome.runtime.sendMessage({ action: "getAudioState" });
            updateAudioUI(response);
        } catch (error) {
            console.error('Error checking browser audio:', error);
            audioStatusElement.textContent = 'Error checking audio status';
        }
    }

    // Start checking browser audio
    checkBrowserAudio();
    setInterval(checkBrowserAudio, 1000);
}); 