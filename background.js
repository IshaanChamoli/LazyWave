let currentAudioState = {
    isPlaying: false,
    tabTitle: '',
    tabId: null
};

// Function to update extension icon and badge
async function updateExtensionIcon(isPlaying) {
    try {
        // Update badge
        if (isPlaying) {
            chrome.action.setBadgeText({ text: "ON" });
            chrome.action.setBadgeBackgroundColor({ color: "#1DB954" }); // Using LazyWave green
            chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
        } else {
            chrome.action.setBadgeText({ text: "" });
        }
    } catch (error) {
        console.error('Error updating icon:', error);
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

        currentAudioState = {
            isPlaying: isPlayingInAnyTab,
            tabTitle: playingTabTitle,
            tabId: playingTabId
        };

        // Update the extension icon when audio state changes
        updateExtensionIcon(isPlayingInAnyTab);

    } catch (error) {
        console.error('Error checking audio status:', error);
    }
}

// Start checking audio status
checkAudioStatus();
setInterval(checkAudioStatus, 1000);

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getAudioState") {
        sendResponse(currentAudioState);
    }
    return true;
}); 