const clientId = '264a5ade3f104c2f9419ff2e0fcf307b';
const redirectUri = chrome.identity.getRedirectURL();


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

    const authUrl = 'https://accounts.spotify.com/authorize?' + args;
    
    chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
    }, function(redirectUrl) {
        if (chrome.runtime.lastError || !redirectUrl) {
            console.error('Auth error:', chrome.runtime.lastError);
            return;
        }
        
        const url = new URL(redirectUrl);
        const hash = url.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');

        if (accessToken) {
            chrome.storage.local.set({ 'spotify_access_token': accessToken }, function() {
                checkNowPlaying();
            });
        }
    });
});

// Update storage access
async function getAccessToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['spotify_access_token'], function(result) {
            resolve(result.spotify_access_token);
        });
    });
}

// Update the token retrieval in your functions
async function checkNowPlaying() {
    const accessToken = await getAccessToken();
    // ... rest of the function remains the same
}

async function togglePlayPause() {
    const accessToken = await getAccessToken();
    // ... rest of the function remains the same
} 