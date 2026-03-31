// ── State ──
let player = null;
let isPlaying = false;
let currentTime = 0;
let duration = 0;
let volume = 75;
let isMuted = false;
let timeUpdateInterval = null;
let currentVideoId = null;
let apiReady = false;
let timestamps = []; // { time: number, label: string }
let currentVideoTitle = '';

// ── DOM refs ──
const urlInput = document.getElementById('url-input');
const loadBtn = document.getElementById('load-btn');
const urlError = document.getElementById('url-error');
const playerBar = document.getElementById('player-bar');
const playPauseBtn = document.getElementById('play-pause-btn');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const progressScrubber = document.getElementById('progress-scrubber');
const volBtn = document.getElementById('vol-btn');
const volSlider = document.getElementById('vol-slider');
const iconVolHigh = document.getElementById('icon-vol-high');
const iconVolLow = document.getElementById('icon-vol-low');
const iconVolMuted = document.getElementById('icon-vol-muted');
const playerTitle = document.getElementById('player-title');
const playerSubtitle = document.getElementById('player-subtitle');
const batchInput = document.getElementById('batch-input');
const batchAddBtn = document.getElementById('batch-add-btn');
const batchClearBtn = document.getElementById('batch-clear-btn');
const timelineList = document.getElementById('timeline-list');
const timelineEmpty = document.getElementById('timeline-empty');
const timelineCount = document.getElementById('timeline-count');
const timelineTitleEl = document.getElementById('timeline-title');
const exportBtn = document.getElementById('export-btn');
const importFile = document.getElementById('import-file');
const importedList = document.getElementById('imported-list');
const importEmpty = document.getElementById('import-empty');
let importedPlaylists = [];

// ── Utilities ──
function extractVideoId(url) {
  const watchMatch = url.match(/youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]+)/);
  if (watchMatch) return watchMatch[1];
  const liveMatch = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]+)/);
  if (liveMatch) return liveMatch[1];
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) return shortMatch[1];
  return null;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }
  return m + ':' + String(sec).padStart(2, '0');
}

function parseTime(str) {
  str = str.trim();
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

// ── YouTube IFrame API ──
function loadYTApi() {
  if (window.YT && window.YT.Player) { apiReady = true; return; }
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const first = document.getElementsByTagName('script')[0];
  first.parentNode.insertBefore(tag, first);
}

window.onYouTubeIframeAPIReady = function() {
  apiReady = true;
};

loadYTApi();

// ── Load volume from localStorage ──
(function loadSettings() {
  try {
    const sv = localStorage.getItem('prism_volume');
    if (sv !== null) { volume = Number(sv); volSlider.value = volume; }
    const sm = localStorage.getItem('prism_muted');
    if (sm === 'true') isMuted = true;
  } catch(e) {}
  updateVolSliderBg();
  updateVolIcon();
})();

// ── Video Loading ──
function loadVideo(videoId) {
  showError('');
  if (!apiReady) {
    showError('YouTube API is loading, please wait...');
    return;
  }

  if (player && currentVideoId === videoId) {
    // Same video, just restart
    player.seekTo(0, true);
    player.playVideo();
    return;
  }

  if (player) {
    currentVideoId = videoId;
    player.loadVideoById({ videoId: videoId, startSeconds: 0 });
    return;
  }

  currentVideoId = videoId;
  player = new YT.Player('yt-player', {
    height: '360',
    width: '640',
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      controls: 1,
      rel: 0,
      origin: window.location.origin,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
}

function onPlayerReady(event) {
  duration = event.target.getDuration() || 0;
  event.target.setVolume(volume);
  if (isMuted) event.target.mute(); else event.target.unMute();
  event.target.playVideo();
  isPlaying = true;
  updatePlayPauseIcon();
  updateTimeDisplay();
  startTimePolling();
  playerBar.classList.add('visible');
  updatePlayerInfo();
}

function onPlayerStateChange(event) {
  if (event.data === 1) { // PLAYING
    isPlaying = true;
    const d = event.target.getDuration && event.target.getDuration();
    if (d > 0) duration = d;
    updatePlayerInfo();
  } else if (event.data === 2) { // PAUSED
    isPlaying = false;
  } else if (event.data === 0) { // ENDED
    isPlaying = false;
  }
  updatePlayPauseIcon();
}

function onPlayerError(event) {
  const code = event.data;
  if (code === 100) showError('Video not found or removed');
  else if (code === 101 || code === 150) showError('Video cannot be embedded');
  else showError('Playback error (' + code + ')');
}

// ── Time Polling (500ms) ──
function startTimePolling() {
  if (timeUpdateInterval) clearInterval(timeUpdateInterval);
  timeUpdateInterval = setInterval(function() {
    if (!player || !player.getCurrentTime) return;
    currentTime = player.getCurrentTime();
    duration = player.getDuration() || duration;
    updateTimeDisplay();
    updateActiveTimestamp();
  }, 500);
}

// ── Controls ──
function togglePlayPause() {
  if (!player) return;
  if (isPlaying) {
    player.pauseVideo();
    isPlaying = false;
  } else {
    player.playVideo();
    isPlaying = true;
  }
  updatePlayPauseIcon();
}

function seekTo(seconds) {
  if (!player) return;
  player.seekTo(seconds, true);
  currentTime = seconds;
  updateTimeDisplay();
}

function setVolumeTo(val) {
  volume = Math.max(0, Math.min(100, val));
  if (player && player.setVolume) player.setVolume(volume);
  if (volume > 0 && isMuted) {
    isMuted = false;
    if (player && player.unMute) player.unMute();
  }
  try { localStorage.setItem('prism_volume', String(volume)); } catch(e) {}
  try { localStorage.setItem('prism_muted', String(isMuted)); } catch(e) {}
  updateVolSliderBg();
  updateVolIcon();
}

function toggleMute() {
  isMuted = !isMuted;
  if (player) {
    if (isMuted) { player.mute && player.mute(); }
    else { player.unMute && player.unMute(); }
  }
  try { localStorage.setItem('prism_muted', String(isMuted)); } catch(e) {}
  updateVolIcon();
}

// ── Prev / Next (timestamp-based) ──
function getCurrentTimestampIndex() {
  if (timestamps.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i].time <= currentTime + 0.5) idx = i;
    else break;
  }
  return idx;
}

function goToNext() {
  if (timestamps.length === 0 || !player) return;
  let nextIdx = -1;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i].time > currentTime + 0.5) {
      nextIdx = i;
      break;
    }
  }
  if (nextIdx === -1) return;
  seekTo(timestamps[nextIdx].time);
  updatePlayerTrackInfo(nextIdx);
}

function goToPrev() {
  if (timestamps.length === 0 || !player) return;
  const curIdx = getCurrentTimestampIndex();
  if (curIdx < 0) {
    seekTo(timestamps[0].time);
    updatePlayerTrackInfo(0);
    return;
  }
  const timeSinceStart = currentTime - timestamps[curIdx].time;
  if (timeSinceStart > 3) {
    seekTo(timestamps[curIdx].time);
  } else {
    const prevIdx = curIdx - 1;
    if (prevIdx >= 0) {
      seekTo(timestamps[prevIdx].time);
      updatePlayerTrackInfo(prevIdx);
    } else {
      seekTo(timestamps[0].time);
      updatePlayerTrackInfo(0);
    }
  }
}

// ── Timestamp Management ──
function addTimestamp(timeStr, label) {
  const time = parseTime(timeStr);
  if (time === null || time < 0) return false;
  if (timestamps.some(function(t) { return t.time === time; })) return false;
  timestamps.push({ time: time, label: label || '' });
  timestamps.sort(function(a, b) { return a.time - b.time; });
  renderTimeline();
  return true;
}

function removeTimestamp(index) {
  timestamps.splice(index, 1);
  renderTimeline();
}

function parseBatchTimestamps(text) {
  const lines = text.split('\n');
  let added = 0;
  lines.forEach(function(line) {
    line = line.trim();
    if (!line) return;
    var match = line.match(/(\d{1,2}:\d{2}:\d{2})/);
    if (!match) match = line.match(/(\d{1,2}:\d{2})/);
    if (match) {
      var timeStr = match[1];
      var label = line.replace(match[0], '').replace(/^[\s\-\|\[\]()]+|[\s\-\|\[\]()]+$/g, '').trim();
      if (addTimestamp(timeStr, label)) added++;
    }
  });
  return added;
}

function clearAllTimestamps() {
  timestamps = [];
  renderTimeline();
}

// ── UI Updates ──
function renderTimeline() {
  timelineList.innerHTML = '';
  if (timestamps.length === 0) {
    timelineEmpty.style.display = 'block';
    timelineCount.textContent = '';
    return;
  }
  timelineEmpty.style.display = 'none';
  timelineCount.textContent = '(' + timestamps.length + ')';
  const curIdx = getCurrentTimestampIndex();

  timestamps.forEach(function(ts, i) {
    const li = document.createElement('li');
    li.className = 'timeline-item' + (i === curIdx ? ' active' : '');
    li.setAttribute('data-index', i);
    li.innerHTML =
      '<span class="ts-index">' + (i + 1) + '</span>' +
      '<span class="ts-time-display">' + formatTime(ts.time) + '</span>' +
      '<span class="ts-title">' + escapeHtml(ts.label || '-') + '</span>' +
      '<button class="ts-delete" title="Delete">&times;</button>';
    li.addEventListener('click', function(e) {
      if (e.target.classList.contains('ts-delete')) {
        removeTimestamp(i);
        return;
      }
      if (player) {
        seekTo(ts.time);
        if (!isPlaying) { player.playVideo(); isPlaying = true; updatePlayPauseIcon(); }
        updatePlayerTrackInfo(i);
      }
    });
    timelineList.appendChild(li);
  });
}

function updateActiveTimestamp() {
  const curIdx = getCurrentTimestampIndex();
  const items = timelineList.querySelectorAll('.timeline-item');
  items.forEach(function(item, i) {
    if (i === curIdx) {
      if (!item.classList.contains('active')) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    } else {
      item.classList.remove('active');
    }
  });
  if (curIdx >= 0) updatePlayerTrackInfo(curIdx);
}

function updatePlayerTrackInfo(idx) {
  if (idx >= 0 && idx < timestamps.length) {
    const ts = timestamps[idx];
    playerTitle.textContent = ts.label || 'Track ' + (idx + 1);
    playerSubtitle.textContent = formatTime(ts.time);
  }
}

function updatePlayerInfo() {
  if (player) {
    try {
      const data = player.getVideoData && player.getVideoData();
      if (data && data.title) {
        currentVideoTitle = data.title;
        timelineTitleEl.textContent = currentVideoTitle;
        if (timestamps.length === 0) {
          playerTitle.textContent = data.title;
          playerSubtitle.textContent = data.author || '';
        }
      }
    } catch(e) {}
  }
}

function updatePlayPauseIcon() {
  iconPlay.style.display = isPlaying ? 'none' : 'block';
  iconPause.style.display = isPlaying ? 'block' : 'none';
  playPauseBtn.title = isPlaying ? 'Pause' : 'Play';
}

function updateTimeDisplay() {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  progressFill.style.width = clamped + '%';
  progressScrubber.style.left = clamped + '%';
  timeCurrent.textContent = formatTime(currentTime);
  timeTotal.textContent = duration > 0 ? formatTime(duration) : '--:--';
}

function updateVolSliderBg() {
  const pct = isMuted ? 0 : volume;
  volSlider.style.background = 'linear-gradient(90deg, var(--accent-pink-light) ' + pct + '%, var(--border-default) ' + pct + '%)';
}

function updateVolIcon() {
  const show = isMuted ? 'muted' : (volume > 50 ? 'high' : 'low');
  iconVolHigh.style.display = show === 'high' ? 'block' : 'none';
  iconVolLow.style.display = show === 'low' ? 'block' : 'none';
  iconVolMuted.style.display = show === 'muted' ? 'block' : 'none';
}

function showError(msg) {
  urlError.textContent = msg;
  urlError.style.display = msg ? 'block' : 'none';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Event Listeners ──
// Load video
loadBtn.addEventListener('click', function() {
  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a URL'); return; }
  const vid = extractVideoId(url);
  if (!vid) { showError('Invalid YouTube URL'); return; }
  loadVideo(vid);
});

urlInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') loadBtn.click();
});

// Play/Pause
playPauseBtn.addEventListener('click', togglePlayPause);
prevBtn.addEventListener('click', goToPrev);
nextBtn.addEventListener('click', goToNext);

// Progress bar: click to seek
let isDraggingProgress = false;

function seekFromEvent(e) {
  const rect = progressBar.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  seekTo(pct * duration);
}

progressBar.addEventListener('mousedown', function(e) {
  isDraggingProgress = true;
  seekFromEvent(e);
});

document.addEventListener('mousemove', function(e) {
  if (isDraggingProgress) seekFromEvent(e);
});

document.addEventListener('mouseup', function() {
  isDraggingProgress = false;
});

progressBar.addEventListener('touchstart', function(e) {
  isDraggingProgress = true;
  seekFromEvent(e);
}, { passive: true });

progressBar.addEventListener('touchmove', function(e) {
  if (isDraggingProgress) seekFromEvent(e);
}, { passive: true });

progressBar.addEventListener('touchend', function() {
  isDraggingProgress = false;
});

// Volume
volSlider.addEventListener('input', function() {
  setVolumeTo(Number(this.value));
});

volBtn.addEventListener('click', function() {
  toggleMute();
  updateVolSliderBg();
});

// Batch input
batchAddBtn.addEventListener('click', function() {
  const text = batchInput.value;
  if (!text.trim()) return;
  const count = parseBatchTimestamps(text);
  if (count > 0) batchInput.value = '';
});

batchClearBtn.addEventListener('click', function() {
  if (timestamps.length === 0) return;
  clearAllTimestamps();
});

// Export timeline
exportBtn.addEventListener('click', function() {
  if (timestamps.length === 0) return;
  var url = urlInput.value.trim() || 'unknown';
  var data = {
    url: url,
    title: currentVideoTitle || '',
    timestamps: timestamps.map(function(ts) {
      return { time: formatTime(ts.time), label: ts.label };
    })
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var safeName = (currentVideoTitle || currentVideoId || 'playlist').replace(/[^a-zA-Z0-9_\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff -]/g, '_').substring(0, 20);
  a.download = safeName + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

// Import file
importFile.addEventListener('change', function(e) {
  var files = e.target.files;
  if (!files.length) return;
  Array.from(files).forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data.url || !Array.isArray(data.timestamps)) return;
        importedPlaylists.push(data);
        renderImportedList();
      } catch(err) {}
    };
    reader.readAsText(file);
  });
  importFile.value = '';
});

function renderImportedList() {
  importedList.innerHTML = '';
  importEmpty.style.display = importedPlaylists.length === 0 ? 'block' : 'none';
  importedPlaylists.forEach(function(pl, pi) {
    var details = document.createElement('details');
    details.className = 'imported-item';
    var summary = document.createElement('summary');
    var displayName = pl.title || pl.url;
    summary.innerHTML =
      '<span class="arrow">&#9654;</span>' +
      '<span class="imported-title">' + escapeHtml(displayName) + '</span>' +
      '<a class="imported-link-btn" href="' + escapeHtml(pl.url) + '" target="_blank" rel="noopener" title="Open link" data-link>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
      '</a>' +
      '<button class="imported-load-btn" data-idx="' + pi + '">Load</button>';
    details.appendChild(summary);
    var ul = document.createElement('ul');
    ul.className = 'imported-ts-list';
    pl.timestamps.forEach(function(ts) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="imp-time">' + escapeHtml(ts.time) + '</span>' + escapeHtml(ts.label || '-');
      ul.appendChild(li);
    });
    details.appendChild(ul);
    importedList.appendChild(details);
  });
}

importedList.addEventListener('click', function(e) {
  // Let link clicks pass through naturally
  if (e.target.closest('[data-link]')) {
    e.stopPropagation();
    return;
  }
  var btn = e.target.closest('.imported-load-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  var idx = Number(btn.getAttribute('data-idx'));
  var pl = importedPlaylists[idx];
  if (!pl) return;
  // Load the URL
  urlInput.value = pl.url;
  loadBtn.click();
  // Set the full title to the timeline header
  var fullTitle = pl.title || pl.url;
  timelineTitleEl.textContent = fullTitle;
  currentVideoTitle = fullTitle;
  // Clear current timestamps and load imported ones
  timestamps = [];
  pl.timestamps.forEach(function(ts) {
    addTimestamp(ts.time, ts.label);
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  const active = document.activeElement;
  const isInput = active instanceof HTMLInputElement ||
                  active instanceof HTMLTextAreaElement ||
                  active instanceof HTMLSelectElement;

  if (e.code === 'Space' && !isInput && player) {
    e.preventDefault();
    togglePlayPause();
  }

  if (e.key === 'ArrowLeft' && !isInput && player) {
    e.preventDefault();
    seekTo(Math.max(0, currentTime - 5));
  }

  if (e.key === 'ArrowRight' && !isInput && player) {
    e.preventDefault();
    seekTo(Math.min(duration, currentTime + 5));
  }
});
