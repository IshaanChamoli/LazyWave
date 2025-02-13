const clientId = '264a5ade3f104c2f9419ff2e0fcf307b'; // Replace with your client ID
const redirectUri = 'http://localhost:8000'; // Make sure this matches exactly

// Generate a random string for state
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Login button click handler
document.getElementById('login-button').addEventListener('click', () => {
    const state = generateRandomString(16);
    const scope = 'user-read-playback-state user-modify-playback-state';

    const args = new URLSearchParams({
        response_type: 'token',
        client_id: clientId,
        scope: scope,
        redirect_uri: redirectUri,
        state: state
    });

    window.location = 'https://accounts.spotify.com/authorize?' + args;
});

// Handle the callback from Spotify
if (window.location.hash) {
    console.log('Hash detected:', window.location.hash);
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');

    if (accessToken) {
        console.log('Access token received');
        localStorage.setItem('spotify_access_token', accessToken);
        window.location.hash = '';
        checkNowPlaying();
    }
}

let isPlaying = false;

async function togglePlayPause() {
    const accessToken = localStorage.getItem('spotify_access_token');
    const button = document.getElementById('play-pause-button');
    const icon = button.querySelector('i');
    
    if (!accessToken) {
        console.error('No access token found');
        return;
    }

    try {
        if (!isPlaying) {
            console.log('Attempting to play...');
            const response = await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.status === 404) {
                alert('No active device found. Please open Spotify first.');
            } else if (response.ok) {
                console.log('Successfully started playback');
                isPlaying = true;
                icon.className = 'fas fa-pause';
            }
        } else {
            console.log('Attempting to pause...');
            const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.ok) {
                console.log('Successfully paused playback');
                isPlaying = false;
                icon.className = 'fas fa-play';
            }
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error controlling playback. Make sure you have Spotify Premium and an active device.');
    }
}

async function checkNowPlaying() {
    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) return;

    try {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (response.status === 204) {
            console.log('No track currently playing');
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
            
            // Update play/pause button state
            const icon = document.querySelector('#play-pause-button i');
            if (icon) {
                const previousState = isPlaying;
                isPlaying = data.is_playing;
                icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
                
                if (previousState !== isPlaying) {
                    console.log(`Playback state changed from ${previousState} to ${isPlaying}`);
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const playPauseButton = document.getElementById('play-pause-button');
    
    if (playPauseButton) {
        playPauseButton.addEventListener('click', togglePlayPause);
    }

    // Check for currently playing track every 1 second
    if (localStorage.getItem('spotify_access_token')) {
        checkNowPlaying();
        setInterval(checkNowPlaying, 1000);
    }
}); 