// service_worker.js

let transcriptionData = [];
let isRecording = false;
let meetingId = null;
let meetingTitle = '';
let apiEndpoint = 'https://your-api-endpoint.com/transcription';
let jwtToken = '';

// Initialize storage
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    language: 'en-US',
    speakerDetection: true,
    smartSummary: false,
    jwtToken: '',
    apiEndpoint: apiEndpoint
  });
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startRecording':
      handleStartRecording(request.data);
      sendResponse({ success: true });
      break;
      
    case 'stopRecording':
      handleStopRecording();
      sendResponse({ success: true });
      break;
      
    case 'pauseRecording':
      handlePauseRecording();
      sendResponse({ success: true });
      break;
      
    case 'resumeRecording':
      handleResumeRecording();
      sendResponse({ success: true });
      break;
      
    case 'transcriptionSegment':
      handleTranscriptionSegment(request.data);
      sendResponse({ success: true });
      break;
      
    case 'getTranscriptionData':
      sendResponse({ data: transcriptionData, isRecording });
      break;
      
    case 'updateSettings':
      handleUpdateSettings(request.data);
      sendResponse({ success: true });
      break;
      
    case 'getSettings':
      chrome.storage.local.get(['language', 'speakerDetection', 'smartSummary', 'jwtToken', 'apiEndpoint'], (result) => {
        sendResponse(result);
      });
      return true; // Will respond asynchronously
      
    case 'getMeetingInfo':
      sendResponse({ meetingId, meetingTitle, isRecording });
      break;
  }
});

function handleStartRecording(data) {
  isRecording = true;
  meetingId = data.meetingId;
  meetingTitle = data.meetingTitle;
  transcriptionData = [];
  
  // Get JWT token from storage
  chrome.storage.local.get(['jwtToken', 'apiEndpoint'], (result) => {
    jwtToken = result.jwtToken;
    apiEndpoint = result.apiEndpoint;
  });
  
  // Notify popup if open
  chrome.runtime.sendMessage({
    action: 'recordingStateChanged',
    data: { isRecording: true }
  }).catch(() => {});
}

function handleStopRecording() {
  isRecording = false;
  
  // Send final batch of data if any
  if (transcriptionData.length > 0) {
    sendBatchToAPI(transcriptionData);
    transcriptionData = [];
  }
  
  // Notify popup if open
  chrome.runtime.sendMessage({
    action: 'recordingStateChanged',
    data: { isRecording: false }
  }).catch(() => {});
}

function handlePauseRecording() {
  isRecording = false;
  
  chrome.runtime.sendMessage({
    action: 'recordingStateChanged',
    data: { isRecording: false, isPaused: true }
  }).catch(() => {});
}

function handleResumeRecording() {
  isRecording = true;
  
  chrome.runtime.sendMessage({
    action: 'recordingStateChanged',
    data: { isRecording: true, isPaused: false }
  }).catch(() => {});
}

function handleTranscriptionSegment(data) {
  if (!isRecording) return;
  
  const segment = {
    google_meeting_id: meetingId,
    meeting_title: meetingTitle,
    speaker: data.speaker || 'Unknown',
    start_time: data.startTime,
    end_time: data.endTime,
    text: data.text
  };
  
  transcriptionData.push(segment);
  
  // Send to popup for display
  chrome.runtime.sendMessage({
    action: 'newTranscriptionSegment',
    data: segment
  }).catch(() => {});
  
  // Send to API in batches of 10
  if (transcriptionData.length >= 10) {
    const batch = transcriptionData.splice(0, 10);
    sendBatchToAPI(batch);
  }
}

function handleUpdateSettings(settings) {
  chrome.storage.local.set(settings, () => {
    // Notify content script of language change
    if (settings.language) {
      chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateLanguage',
            language: settings.language
          }).catch(() => {});
        });
      });
    }
  });
}

async function sendBatchToAPI(batch) {
  if (!jwtToken || !apiEndpoint) {
    console.error('JWT token or API endpoint not configured');
    return;
  }
  
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`
      },
      body: JSON.stringify({
        transcriptions: batch
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    console.log('Batch sent successfully');
  } catch (error) {
    console.error('Failed to send batch to API:', error);
    // Store failed batches for retry
    chrome.storage.local.get('failedBatches', (result) => {
      const failedBatches = result.failedBatches || [];
      failedBatches.push({ batch, timestamp: Date.now() });
      chrome.storage.local.set({ failedBatches });
    });
  }
}

// Retry failed batches periodically
setInterval(() => {
  chrome.storage.local.get(['failedBatches', 'jwtToken', 'apiEndpoint'], async (result) => {
    if (!result.failedBatches || result.failedBatches.length === 0) return;
    
    jwtToken = result.jwtToken;
    apiEndpoint = result.apiEndpoint;
    
    const retryBatches = [...result.failedBatches];
    const remainingBatches = [];
    
    for (const item of retryBatches) {
      try {
        await sendBatchToAPI(item.batch);
      } catch (error) {
        // Keep for next retry if less than 1 hour old
        if (Date.now() - item.timestamp < 3600000) {
          remainingBatches.push(item);
        }
      }
    }
    
    chrome.storage.local.set({ failedBatches: remainingBatches });
  });
}, 60000); // Retry every minute