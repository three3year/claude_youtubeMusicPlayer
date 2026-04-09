// ─────────────────────────────────────────────────────────────
// timestamp.js — 時間戳模式（舊功能）
// 載入單一影片，把影片用時間戳分段成不同曲目，prev/next 在時間戳間跳轉
// ─────────────────────────────────────────────────────────────

window.TimestampMode = {
  // ── 私有 State ──
  timestamps: [],            // [{ time: number, label: string }]
  currentVideoTitle: '',
  importedPlaylists: [],

  // ── DOM refs（init 時填入）──
  el: {
    urlInput: null, loadBtn: null, urlError: null,
    batchInput: null, batchAddBtn: null, batchClearBtn: null,
    timelineList: null, timelineEmpty: null, timelineCount: null, timelineTitleEl: null,
    exportBtn: null, importFile: null, importedList: null, importEmpty: null,
  },

  // ── Timestamp helpers ──
  getCurrentTimestampIndex: function() {
    var T = TimestampMode;
    if (T.timestamps.length === 0) return -1;
    var idx = -1;
    for (var i = 0; i < T.timestamps.length; i++) {
      if (T.timestamps[i].time <= App.state.currentTime + 0.5) idx = i;
      else break;
    }
    return idx;
  },

  goToNext: function() {
    var T = TimestampMode;
    if (T.timestamps.length === 0 || !App.state.player) return;
    var nextIdx = -1;
    for (var i = 0; i < T.timestamps.length; i++) {
      if (T.timestamps[i].time > App.state.currentTime + 0.5) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx === -1) return;
    App.seekTo(T.timestamps[nextIdx].time);
    T.updatePlayerTrackInfo(nextIdx);
  },

  goToPrev: function() {
    var T = TimestampMode;
    if (T.timestamps.length === 0 || !App.state.player) return;
    var curIdx = T.getCurrentTimestampIndex();
    if (curIdx < 0) {
      App.seekTo(T.timestamps[0].time);
      T.updatePlayerTrackInfo(0);
      return;
    }
    var timeSinceStart = App.state.currentTime - T.timestamps[curIdx].time;
    if (timeSinceStart > 3) {
      App.seekTo(T.timestamps[curIdx].time);
    } else {
      var prevIdx = curIdx - 1;
      if (prevIdx >= 0) {
        App.seekTo(T.timestamps[prevIdx].time);
        T.updatePlayerTrackInfo(prevIdx);
      } else {
        App.seekTo(T.timestamps[0].time);
        T.updatePlayerTrackInfo(0);
      }
    }
  },

  addTimestamp: function(timeStr, label) {
    var T = TimestampMode;
    var time = App.parseTime(timeStr);
    if (time === null || time < 0) return false;
    if (T.timestamps.some(function(t) { return t.time === time; })) return false;
    T.timestamps.push({ time: time, label: label || '' });
    T.timestamps.sort(function(a, b) { return a.time - b.time; });
    T.renderTimeline();
    return true;
  },

  removeTimestamp: function(index) {
    TimestampMode.timestamps.splice(index, 1);
    TimestampMode.renderTimeline();
  },

  parseBatchTimestamps: function(text) {
    var T = TimestampMode;
    var lines = text.split('\n');
    var added = 0;
    lines.forEach(function(line) {
      line = line.trim();
      if (!line) return;
      var match = line.match(/(\d{1,2}:\d{2}:\d{2})/);
      if (!match) match = line.match(/(\d{1,2}:\d{2})/);
      if (match) {
        var timeStr = match[1];
        var label = line.replace(match[0], '').replace(/^[\s\-\|\[\]()]+|[\s\-\|\[\]()]+$/g, '').trim();
        if (T.addTimestamp(timeStr, label)) added++;
      }
    });
    return added;
  },

  clearAllTimestamps: function() {
    TimestampMode.timestamps = [];
    TimestampMode.renderTimeline();
  },

  // ── UI Updates ──
  renderTimeline: function() {
    var T = TimestampMode;
    var el = T.el;
    el.timelineList.innerHTML = '';
    if (T.timestamps.length === 0) {
      el.timelineEmpty.style.display = 'block';
      el.timelineCount.textContent = '';
      App.renderAnchorMarkers();
      return;
    }
    el.timelineEmpty.style.display = 'none';
    el.timelineCount.textContent = '(' + T.timestamps.length + ')';
    var curIdx = T.getCurrentTimestampIndex();

    T.timestamps.forEach(function(ts, i) {
      var li = document.createElement('li');
      li.className = 'timeline-item' + (i === curIdx ? ' active' : '');
      li.setAttribute('data-index', i);
      li.innerHTML =
        '<span class="ts-index">' + (i + 1) + '</span>' +
        '<span class="ts-time-display">' + App.formatTime(ts.time) + '</span>' +
        '<span class="ts-title">' + App.escapeHtml(ts.label || '-') + '</span>' +
        '<button class="ts-delete" title="Delete">&times;</button>';
      li.addEventListener('click', function(e) {
        if (e.target.classList.contains('ts-delete')) {
          T.removeTimestamp(i);
          return;
        }
        if (App.state.player) {
          App.seekTo(ts.time);
          if (!App.state.isPlaying) {
            App.state.player.playVideo();
            App.state.isPlaying = true;
            App.updatePlayPauseIcon();
          }
          T.updatePlayerTrackInfo(i);
        }
      });
      el.timelineList.appendChild(li);
    });
    App.renderAnchorMarkers();
  },

  updateActiveTimestamp: function() {
    var T = TimestampMode;
    var curIdx = T.getCurrentTimestampIndex();
    var items = T.el.timelineList.querySelectorAll('.timeline-item');
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
    if (curIdx >= 0) T.updatePlayerTrackInfo(curIdx);
  },

  updatePlayerTrackInfo: function(idx) {
    var T = TimestampMode;
    if (idx >= 0 && idx < T.timestamps.length) {
      var ts = T.timestamps[idx];
      App.el.playerTitle.textContent = ts.label || 'Track ' + (idx + 1);
      App.el.playerSubtitle.textContent = App.formatTime(ts.time);
    }
  },

  updateTimelinePlayerInfo: function() {
    var T = TimestampMode;
    if (App.state.player) {
      try {
        var data = App.state.player.getVideoData && App.state.player.getVideoData();
        if (data && data.title) {
          T.currentVideoTitle = data.title;
          T.el.timelineTitleEl.textContent = data.title;
          if (T.timestamps.length === 0) {
            App.el.playerTitle.textContent = data.title;
            App.el.playerSubtitle.textContent = data.author || '';
          }
        }
      } catch(e) {}
    }
  },

  renderTimestampMarkers: function() {
    var T = TimestampMode;
    var pb = App.el.progressBar;
    if (!pb || App.state.duration <= 0) return;
    for (var j = 0; j < T.timestamps.length; j++) {
      var pct = (T.timestamps[j].time / App.state.duration) * 100;
      var marker = document.createElement('div');
      marker.className = 'progress-anchor-marker';
      marker.style.left = pct + '%';
      marker.title = (T.timestamps[j].label || 'Track ' + (j + 1)) + ' (' + App.formatTime(T.timestamps[j].time) + ')';
      pb.appendChild(marker);
    }
  },

  showError: function(msg) {
    var el = TimestampMode.el.urlError;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  },

  // ── Imported Playlists (.json) ──
  renderImportedList: function() {
    var T = TimestampMode;
    T.el.importedList.innerHTML = '';
    T.el.importEmpty.style.display = T.importedPlaylists.length === 0 ? 'block' : 'none';
    T.importedPlaylists.forEach(function(pl, pi) {
      var details = document.createElement('details');
      details.className = 'imported-item';
      var summary = document.createElement('summary');
      var displayName = pl.title || pl.url;
      summary.innerHTML =
        '<span class="arrow">&#9654;</span>' +
        '<span class="imported-title">' + App.escapeHtml(displayName) + '</span>' +
        '<a class="imported-link-btn" href="' + App.escapeHtml(pl.url) + '" target="_blank" rel="noopener" title="Open link" data-link>' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
        '</a>' +
        '<button class="imported-load-btn" data-idx="' + pi + '">Load</button>';
      details.appendChild(summary);
      var ul = document.createElement('ul');
      ul.className = 'imported-ts-list';
      pl.timestamps.forEach(function(ts) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="imp-time">' + App.escapeHtml(ts.time) + '</span>' + App.escapeHtml(ts.label || '-');
        ul.appendChild(li);
      });
      details.appendChild(ul);
      T.el.importedList.appendChild(details);
    });
  },

  // ── 初始化 ──
  init: function() {
    var T = TimestampMode;
    var el = T.el;

    // 1. 抓 DOM refs
    el.urlInput = document.getElementById('url-input');
    el.loadBtn = document.getElementById('load-btn');
    el.urlError = document.getElementById('url-error');
    el.batchInput = document.getElementById('batch-input');
    el.batchAddBtn = document.getElementById('batch-add-btn');
    el.batchClearBtn = document.getElementById('batch-clear-btn');
    el.timelineList = document.getElementById('timeline-list');
    el.timelineEmpty = document.getElementById('timeline-empty');
    el.timelineCount = document.getElementById('timeline-count');
    el.timelineTitleEl = document.getElementById('timeline-title');
    el.exportBtn = document.getElementById('export-btn');
    el.importFile = document.getElementById('import-file');
    el.importedList = document.getElementById('imported-list');
    el.importEmpty = document.getElementById('import-empty');

    // 2. 事件監聽
    el.loadBtn.addEventListener('click', function() {
      var url = el.urlInput.value.trim();
      if (!url) { T.showError('Please enter a URL'); return; }
      var vid = App.extractVideoId(url);
      if (!vid) { T.showError('Invalid YouTube URL'); return; }
      T.showError('');
      App.loadVideo(vid);
    });

    el.urlInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') el.loadBtn.click();
    });

    el.batchAddBtn.addEventListener('click', function() {
      var text = el.batchInput.value;
      if (!text.trim()) return;
      var count = T.parseBatchTimestamps(text);
      if (count > 0) el.batchInput.value = '';
    });

    el.batchClearBtn.addEventListener('click', function() {
      if (T.timestamps.length === 0) return;
      T.clearAllTimestamps();
    });

    // Export timeline
    el.exportBtn.addEventListener('click', function() {
      if (T.timestamps.length === 0) return;
      var url = el.urlInput.value.trim() || 'unknown';
      var data = {
        url: url,
        title: T.currentVideoTitle || '',
        timestamps: T.timestamps.map(function(ts) {
          return { time: App.formatTime(ts.time), label: ts.label };
        })
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      var safeName = (T.currentVideoTitle || App.state.currentVideoId || 'playlist')
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff -]/g, '_').substring(0, 20);
      a.download = safeName + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // Import file
    el.importFile.addEventListener('change', function(e) {
      var files = e.target.files;
      if (!files.length) return;
      Array.from(files).forEach(function(file) {
        var reader = new FileReader();
        reader.onload = function(ev) {
          try {
            var data = JSON.parse(ev.target.result);
            if (!data.url || !Array.isArray(data.timestamps)) return;
            T.importedPlaylists.push(data);
            T.renderImportedList();
          } catch(err) {}
        };
        reader.readAsText(file);
      });
      el.importFile.value = '';
    });

    el.importedList.addEventListener('click', function(e) {
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
      var pl = T.importedPlaylists[idx];
      if (!pl) return;
      // Load the URL
      el.urlInput.value = pl.url;
      el.loadBtn.click();
      // Set the full title to the timeline header
      var fullTitle = pl.title || pl.url;
      el.timelineTitleEl.textContent = fullTitle;
      T.currentVideoTitle = fullTitle;
      // Clear current timestamps and load imported ones
      T.timestamps = [];
      pl.timestamps.forEach(function(ts) {
        T.addTimestamp(ts.time, ts.label);
      });
    });

    // 3. 註冊到 Modes registry
    App.modes.timestamp = {
      onPrev:          T.goToPrev,
      onNext:          T.goToNext,
      onEnded:         function() { /* no-op */ },
      onPlaying:       T.updateTimelinePlayerInfo,
      onActivePoll:    T.updateActiveTimestamp,
      onAnchorMarkers: T.renderTimestampMarkers,
    };
  },
};

document.addEventListener('DOMContentLoaded', TimestampMode.init);
