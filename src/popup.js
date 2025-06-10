// popup.js

let transcriptionData = [];
let isRecording = false;
let startTime = null;
let durationInterval = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Set up tab switching
  setupTabs();
  
  // Load settings
  await loadSettings();
  
  // Load transcription data
  await loadTranscriptionData();
  
  // Set up event listeners
  setupEventListeners();
  
  // Listen for updates from service worker
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Start duration timer if recording
  if (isRecording && startTime) {
    startDurationTimer();
  }
});

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      // Update active states
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

async function loadSettings() {
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
  
  document.getElementById('language-select').value = settings.language || 'en-US';
  document.getElementById('speaker-detection').checked = settings.speakerDetection !== false;
  document.getElementById('smart-summary').checked = settings.smartSummary || false;
  document.getElementById('jwt-token').value = settings.jwtToken || '';
  document.getElementById('api-endpoint').value = settings.apiEndpoint || '';
}

async function loadTranscriptionData() {
  const response = await chrome.runtime.sendMessage({ action: 'getTranscriptionData' });
  transcriptionData = response.data || [];
  isRecording = response.isRecording || false;
  
  // Get meeting info
  const meetingInfo = await chrome.runtime.sendMessage({ action: 'getMeetingInfo' });
  if (meetingInfo.meetingTitle) {
    document.getElementById('meeting-title').textContent = meetingInfo.meetingTitle;
  }
  
  // Update UI
  updateTranscriptionDisplay();
  updateRecordingStatus();
  
  // Calculate start time from first transcription
  if (transcriptionData.length > 0) {
    startTime = transcriptionData[0].start_time;
  }
}

function setupEventListeners() {
  // Settings
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  
  // Language change
  document.getElementById('language-select').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      data: { language: e.target.value }
    });
  });
  
  // Toggle changes
  document.getElementById('speaker-detection').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      data: { speakerDetection: e.target.checked }
    });
  });
  
  document.getElementById('smart-summary').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({
      action: 'updateSettings',
      data: { smartSummary: e.target.checked }
    });
  });
  
  // Transcription actions
  document.getElementById('clear-btn').addEventListener('click', clearTranscription);
  document.getElementById('export-btn').addEventListener('click', exportTranscription);
}

function saveSettings() {
  const settings = {
    jwtToken: document.getElementById('jwt-token').value,
    apiEndpoint: document.getElementById('api-endpoint').value
  };
  
  chrome.runtime.sendMessage({
    action: 'updateSettings',
    data: settings
  });
  
  // Show saved animation
  const saveBtn = document.getElementById('save-settings');
  const originalContent = saveBtn.innerHTML;
  
  saveBtn.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="white"/>
    </svg>
    Saved!
  `;
  saveBtn.style.background = 'linear-gradient(135deg, #34a853 0%, #0f9d58 100%)';
  saveBtn.classList.add('success-animation');
  
  setTimeout(() => {
    saveBtn.innerHTML = originalContent;
    saveBtn.style.background = '';
    saveBtn.classList.remove('success-animation');
  }, 2000);
}

function handleMessage(request) {
  switch (request.action) {
    case 'newTranscriptionSegment':
      addTranscriptionSegment(request.data);
      break;
      
    case 'recordingStateChanged':
      isRecording = request.data.isRecording;
      updateRecordingStatus();
      
      if (isRecording && !startTime) {
        startTime = Date.now();
        startDurationTimer();
      } else if (!isRecording) {
        stopDurationTimer();
      }
      break;
  }
}

function addTranscriptionSegment(segment) {
  transcriptionData.push(segment);
  
  // Remove empty state if exists
  const emptyState = document.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
  
  // Create segment element
  const segmentEl = document.createElement('div');
  segmentEl.className = 'transcription-segment';
  
  const timeEl = document.createElement('div');
  timeEl.className = 'segment-time';
  timeEl.textContent = formatTime(segment.start_time);
  
  const contentEl = document.createElement('div');
  contentEl.className = 'segment-content';
  
  const speakerEl = document.createElement('div');
  speakerEl.className = 'segment-speaker';
  
  // Create speaker icon with first letter
  const speakerIcon = document.createElement('span');
  speakerIcon.className = 'speaker-icon';
  speakerIcon.textContent = segment.speaker.charAt(0).toUpperCase();
  
  const speakerName = document.createElement('span');
  speakerName.textContent = segment.speaker;
  
  speakerEl.appendChild(speakerIcon);
  speakerEl.appendChild(speakerName);
  
  const textEl = document.createElement('div');
  textEl.className = 'segment-text';
  textEl.textContent = segment.text;
  
  contentEl.appendChild(speakerEl);
  contentEl.appendChild(textEl);
  
  segmentEl.appendChild(timeEl);
  segmentEl.appendChild(contentEl);
  
  const container = document.getElementById('transcription-container');
  container.appendChild(segmentEl);
  
  // Auto-scroll to bottom with smooth animation
  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth'
  });
}

function updateTranscriptionDisplay() {
  const container = document.getElementById('transcription-container');
  
  if (transcriptionData.length === 0) {
    return; // Keep empty state
  }
  
  // Clear and rebuild
  container.innerHTML = '';
  transcriptionData.forEach(segment => addTranscriptionSegment(segment));
}

function updateRecordingStatus() {
  const statusIndicator = document.getElementById('status-indicator');
  const statusDot = statusIndicator.querySelector('.status-dot');
  const statusText = statusIndicator.querySelector('.status-text');
  
  if (isRecording) {
    statusDot.classList.add('recording');
    statusText.textContent = 'Recording';
  } else {
    statusDot.classList.remove('recording');
    statusText.textContent = 'Not Recording';
  }
}

function startDurationTimer() {
  if (!startTime) startTime = Date.now();
  
  const updateDuration = () => {
    const elapsed = Date.now() - startTime;
    document.getElementById('duration').textContent = formatDuration(elapsed);
  };
  
  updateDuration();
  durationInterval = setInterval(updateDuration, 1000);
}

function stopDurationTimer() {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
}

function clearTranscription() {
  if (confirm('Clear all transcription data?')) {
    transcriptionData = [];
    updateTranscriptionDisplay();
    
    // Reset duration
    document.getElementById('duration').textContent = '00:00:00';
    startTime = null;
  }
}

function exportTranscription() {
  if (transcriptionData.length === 0) {
    alert('No transcription data to export');
    return;
  }
  
  // Create export content
  const meetingTitle = document.getElementById('meeting-title').textContent;
  const duration = document.getElementById('duration').textContent;
  
  let content = `Meeting: ${meetingTitle}\n`;
  content += `Duration: ${duration}\n`;
  content += `Date: ${new Date().toLocaleString()}\n`;
  content += '\n---\n\n';
  
  transcriptionData.forEach(segment => {
    const time = formatTime(segment.start_time);
    content += `[${time}] ${segment.speaker}: ${segment.text}\n\n`;
  });
  
  // Create download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${meetingTitle.replace(/[^a-z0-9]/gi, '_')}_transcript_${new Date().getTime()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}