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
    const scope = 'user-read-playback-state';

    const args = new URLSearchParams({
        response_type: 'token',
        client_id: clientId,
        scope: scope,
        redirect_uri: redirectUri,
        state: state
    });

    const authUrl = 'https://accounts.spotify.com/authorize?' + args;
    console.log('Redirecting to:', authUrl);
    window.location = authUrl;
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

// Function to check what's currently playing
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
            return;
        }

        const data = await response.json();
        if (data && data.item) {
            document.getElementById('now-playing').style.display = 'block';
            document.getElementById('track-name').textContent = data.item.name;
            document.getElementById('artist-name').textContent = data.item.artists.map(artist => artist.name).join(', ');
            document.getElementById('album-name').textContent = data.item.album.name;
            document.getElementById('album-art').src = data.item.album.images[0].url;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Check for currently playing track every 5 seconds
if (localStorage.getItem('spotify_access_token')) {
    setInterval(checkNowPlaying, 5000);
    checkNowPlaying();
} 