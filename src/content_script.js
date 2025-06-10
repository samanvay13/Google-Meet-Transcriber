// content_script.js

let recognition = null;
let isRecording = false;
let isPaused = false;
let currentLanguage = 'en-US';
let meetingId = null;
let meetingTitle = '';
let speakerDetection = true;

// Initialize
(async function init() {
  // Get settings
  const settings = await chrome.storage.local.get(['language', 'speakerDetection']);
  currentLanguage = settings.language || 'en-US';
  speakerDetection = settings.speakerDetection !== false;
  
  // Extract meeting info
  extractMeetingInfo();
  
  // Create control buttons
  createControlButtons();
  
  // Set up speech recognition
  setupSpeechRecognition();
})();

function extractMeetingInfo() {
  // Extract meeting ID from URL
  const url = window.location.href;
  const meetingIdMatch = url.match(/meet\.google\.com\/([a-z0-9-]+)/i);
  meetingId = meetingIdMatch ? meetingIdMatch[1] : generateUUID();
  
  // Try to extract meeting title from page
  setTimeout(() => {
    const titleElement = document.querySelector('[data-meeting-title]') || 
                        document.querySelector('div[jsname="Ypafjf"]') ||
                        document.querySelector('span[data-is-tooltip-wrapper="true"]');
    meetingTitle = titleElement ? titleElement.textContent : 'Google Meet Session';
  }, 2000);
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function createControlButtons() {
  // Create container
  const container = document.createElement('div');
  container.id = 'transcriber-controls';
  container.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 0;
    transform: translateX(-50%);
    background: rgba(32, 33, 36, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 28px;
    padding: 12px 20px;
    display: flex;
    gap: 16px;
    z-index: 9999;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 
                0 0 0 1px rgba(255, 255, 255, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  
  // Add hover effect to container
  container.onmouseenter = () => {
    container.style.transform = 'translateX(-50%) translateY(-4px)';
    container.style.boxShadow = `
      0 12px 48px rgba(0, 0, 0, 0.4), 
      0 0 0 1px rgba(255, 255, 255, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.15)
    `;
  };
  
  container.onmouseleave = () => {
    container.style.transform = 'translateX(-50%) translateY(0)';
    container.style.boxShadow = `
      0 8px 32px rgba(0, 0, 0, 0.3), 
      0 0 0 1px rgba(255, 255, 255, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.1)
    `;
  };
  
  // Record button
  const recordBtn = createButton('record-btn', 'Record', '#ea4335', `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" fill="white"/>
    </svg>
  `);
  recordBtn.onclick = toggleRecording;
  
  // Pause button
  const pauseBtn = createButton('pause-btn', 'Pause', '#fbbc04', `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="4" width="4" height="16" rx="1" fill="white"/>
      <rect x="14" y="4" width="4" height="16" rx="1" fill="white"/>
    </svg>
  `);
  pauseBtn.style.display = 'none';
  pauseBtn.onclick = togglePause;
  
  // Stop button
  const stopBtn = createButton('stop-btn', 'Stop', '#4285f4', `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="white"/>
    </svg>
  `);
  stopBtn.style.display = 'none';
  stopBtn.onclick = stopRecording;
  
  container.appendChild(recordBtn);
  container.appendChild(pauseBtn);
  container.appendChild(stopBtn);
  
  // Wait for Google Meet UI to load
  const checkInterval = setInterval(() => {
    const meetContainer = document.querySelector('[jsname="v6U4Zd"]') || 
                         document.querySelector('[jsname="Qx7uuf"]') ||
                         document.querySelector('.crqnQb');
    if (meetContainer) {
      document.body.appendChild(container);
      clearInterval(checkInterval);
    }
  }, 1000);
}

function createButton(id, text, color, iconSvg) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.style.cssText = `
    background: ${color};
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 4px 12px ${color}40;
  `;
  
  // Add icon
  const iconWrapper = document.createElement('span');
  iconWrapper.innerHTML = iconSvg;
  iconWrapper.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    transition: all 0.3s;
  `;
  
  // Add text
  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  
  // Add ripple effect container
  const rippleContainer = document.createElement('span');
  rippleContainer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
  `;
  
  btn.appendChild(rippleContainer);
  btn.appendChild(iconWrapper);
  btn.appendChild(textSpan);
  
  // Hover effects
  btn.onmouseover = () => {
    btn.style.transform = 'translateY(-2px) scale(1.05)';
    btn.style.boxShadow = `0 6px 20px ${color}50`;
    iconWrapper.style.transform = 'rotate(180deg)';
  };
  
  btn.onmouseout = () => {
    btn.style.transform = 'translateY(0) scale(1)';
    btn.style.boxShadow = `0 4px 12px ${color}40`;
    iconWrapper.style.transform = 'rotate(0)';
  };
  
  // Click ripple effect
  btn.addEventListener('click', function(e) {
    const rect = this.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      transform: scale(0);
      animation: ripple-animation 0.6s ease-out;
      left: ${x}px;
      top: ${y}px;
    `;
    
    rippleContainer.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
  });
  
  // Add ripple animation
  if (!document.getElementById('transcriber-styles')) {
    const style = document.createElement('style');
    style.id = 'transcriber-styles';
    style.textContent = `
      @keyframes ripple-animation {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
      
      @keyframes pulse-glow {
        0%, 100% {
          box-shadow: 0 0 20px rgba(234, 67, 53, 0.6);
        }
        50% {
          box-shadow: 0 0 40px rgba(234, 67, 53, 0.8);
        }
      }
      
      #transcriber-controls {
        animation: slide-up 0.5s ease-out;
      }
      
      @keyframes slide-up {
        from {
          transform: translateX(-50%) translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }
      
      #record-btn.recording {
        animation: pulse-glow 2s infinite;
      }
      
      .transcriber-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(32, 33, 36, 0.95);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 10000;
        backdrop-filter: blur(20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        animation: notification-slide-in 0.4s ease-out;
      }
      
      @keyframes notification-slide-in {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      .transcriber-notification.success {
        background: rgba(52, 168, 83, 0.95);
      }
      
      .transcriber-notification.error {
        background: rgba(234, 67, 53, 0.95);
      }
    `;
    document.head.appendChild(style);
  }
  
  return btn;
}

function setupSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    console.error('Speech recognition not supported');
    return;
  }
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = currentLanguage;
  
  let currentSegmentStart = null;
  let lastSpeaker = null;
  
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    
    if (result.isFinal) {
      const text = result[0].transcript;
      const endTime = Date.now();
      const startTime = currentSegmentStart || endTime - 3000; // Estimate 3 seconds if not set
      
      // Attempt speaker detection
      const speaker = detectSpeaker() || lastSpeaker || 'Unknown';
      lastSpeaker = speaker;
      
      // Send to service worker
      chrome.runtime.sendMessage({
        action: 'transcriptionSegment',
        data: {
          text,
          speaker,
          startTime,
          endTime
        }
      });
      
      currentSegmentStart = null;
    } else if (!currentSegmentStart) {
      currentSegmentStart = Date.now();
    }
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    if (event.error === 'not-allowed') {
      alert('Microphone access denied. Please allow microphone access to use transcription.');
    }
  };
  
  recognition.onend = () => {
    if (isRecording && !isPaused) {
      // Restart recognition if still recording
      recognition.start();
    }
  };
}

function detectSpeaker() {
  if (!speakerDetection) return null;
  
  // Try to detect active speaker from Google Meet UI
  const speakerIndicators = [
    // Look for speaking indicator
    document.querySelector('[jscontroller="Y6eqGe"][data-participant-id][data-ssrc][jsaction*="speaking"]'),
    // Look for active speaker frame
    document.querySelector('.axUSnc.P9KVBf'), // Active speaker highlight
    // Look for name in active tile
    document.querySelector('[data-self-name]'),
    document.querySelector('[data-participant-id] [style*="opacity: 1"]')
  ];
  
  for (const indicator of speakerIndicators) {
    if (indicator) {
      // Try to extract name from various attributes or text content
      const name = indicator.getAttribute('data-self-name') ||
                   indicator.querySelector('[jsname="W0RSoc"]')?.textContent ||
                   indicator.querySelector('.KV1GEc')?.textContent ||
                   indicator.textContent?.trim();
      
      if (name && name !== '') {
        return name;
      }
    }
  }
  
  // Fallback: check for "You" indicator
  const youIndicator = document.querySelector('[aria-label*="You are presenting"]') ||
                      document.querySelector('[data-self-name="true"]');
  if (youIndicator) {
    return 'You';
  }
  
  return null;
}

function toggleRecording() {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
}

function startRecording() {
  isRecording = true;
  isPaused = false;
  
  // Update UI
  const recordBtn = document.getElementById('record-btn');
  recordBtn.style.display = 'none';
  recordBtn.classList.add('recording');
  
  document.getElementById('pause-btn').style.display = 'block';
  document.getElementById('stop-btn').style.display = 'block';
  
  // Show notification
  showNotification('Recording started', 'success');
  
  // Refresh meeting info
  extractMeetingInfo();
  
  // Notify service worker
  chrome.runtime.sendMessage({
    action: 'startRecording',
    data: { meetingId, meetingTitle }
  });
  
  // Start speech recognition
  if (recognition) {
    recognition.start();
  }
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `transcriber-notification ${type}`;
  
  const icon = type === 'success' ? 
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
       <path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z" fill="white"/>
     </svg>` :
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
       <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z" fill="white"/>
     </svg>`;
  
  notification.innerHTML = `${icon}<span>${message}</span>`;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'notification-slide-in 0.4s ease-out reverse';
    setTimeout(() => notification.remove(), 400);
  }, 3000);
}

function togglePause() {
  if (isPaused) {
    resumeRecording();
  } else {
    pauseRecording();
  }
}

function pauseRecording() {
  isPaused = true;
  document.getElementById('pause-btn').textContent = 'Resume';
  
  // Stop recognition
  if (recognition) {
    recognition.stop();
  }
  
  chrome.runtime.sendMessage({ action: 'pauseRecording' });
}

function resumeRecording() {
  isPaused = false;
  document.getElementById('pause-btn').textContent = 'Pause';
  
  // Restart recognition
  if (recognition) {
    recognition.start();
  }
  
  chrome.runtime.sendMessage({ action: 'resumeRecording' });
}

function stopRecording() {
  isRecording = false;
  isPaused = false;
  
  // Update UI
  document.getElementById('record-btn').style.display = 'block';
  document.getElementById('pause-btn').style.display = 'none';
  document.getElementById('stop-btn').style.display = 'none';
  document.getElementById('pause-btn').textContent = 'Pause';
  
  // Stop recognition
  if (recognition) {
    recognition.stop();
  }
  showNotification('Recording stopped', 'success');
  chrome.runtime.sendMessage({ action: 'stopRecording' });
}

// Listen for settings updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateLanguage') {
    currentLanguage = request.language;
    if (recognition) {
      recognition.lang = currentLanguage;
      // Restart recognition if recording
      if (isRecording && !isPaused) {
        recognition.stop();
        setTimeout(() => recognition.start(), 100);
      }
    }
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (isRecording) {
    stopRecording();
  }
});