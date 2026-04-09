// ─────────────────────────────────────────────────────────────
// core.js — 共用基底（YouTube IFrame API、播放器狀態、player bar 控制、
//           鍵盤快捷鍵、模式切換、Modes registry）
// ─────────────────────────────────────────────────────────────

window.App = {
  // ── 共用 State ──
  state: {
    player: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 75,
    isMuted: false,
    currentVideoId: null,
    apiReady: false,
    appMode: 'timestamp',
    _timeInterval: null,
  },

  // 由 timestamp.js / playlist.js 註冊
  modes: {},

  // ── DOM refs（player bar 共用部分；init 時填入）──
  el: {
    playerBar: null, playPauseBtn: null, prevBtn: null, nextBtn: null,
    iconPlay: null, iconPause: null,
    timeCurrent: null, timeTotal: null,
    progressBar: null, progressFill: null, progressScrubber: null,
    volBtn: null, volSlider: null, iconVolHigh: null, iconVolLow: null, iconVolMuted: null,
    playerTitle: null, playerSubtitle: null,
  },

  // ── Utilities ──
  extractVideoId: function(url) {
    var watchMatch = url.match(/youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) return watchMatch[1];
    var liveMatch = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]+)/);
    if (liveMatch) return liveMatch[1];
    var shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];
    return null;
  },

  formatTime: function(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    var s = Math.floor(seconds);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) {
      return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }
    return m + ':' + String(sec).padStart(2, '0');
  },

  parseTime: function(str) {
    str = str.trim();
    var parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  },

  escapeHtml: function(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // ── YouTube IFrame API ──
  loadYTApi: function() {
    if (window.YT && window.YT.Player) { App.state.apiReady = true; return; }
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(tag, first);
  },

  loadVideo: function(videoId) {
    var s = App.state;
    if (!s.apiReady) {
      // 模式自身會處理錯誤訊息；這裡不觸碰 mode-specific UI
      console.warn('YouTube API is loading, please wait...');
      return;
    }

    if (s.player && s.currentVideoId === videoId) {
      // 同一支影片，從頭播
      s.player.seekTo(0, true);
      s.player.playVideo();
      return;
    }

    if (s.player) {
      s.currentVideoId = videoId;
      s.player.loadVideoById({ videoId: videoId, startSeconds: 0 });
      return;
    }

    s.currentVideoId = videoId;
    s.player = new YT.Player('yt-player', {
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
        onReady: App.onPlayerReady,
        onStateChange: App.onPlayerStateChange,
        onError: App.onPlayerError,
      },
    });
  },

  onPlayerReady: function(event) {
    var s = App.state;
    s.duration = event.target.getDuration() || 0;
    event.target.setVolume(s.volume);
    if (s.isMuted) event.target.mute(); else event.target.unMute();
    event.target.playVideo();
    s.isPlaying = true;
    App.updatePlayPauseIcon();
    App.updateTimeDisplay();
    App.renderAnchorMarkers();
    App.startTimePolling();
    App.el.playerBar.classList.add('visible');
    var m = App.modes[s.appMode];
    if (m && m.onPlaying) m.onPlaying();
  },

  onPlayerStateChange: function(event) {
    var s = App.state;
    if (event.data === 1) { // PLAYING
      s.isPlaying = true;
      var d = event.target.getDuration && event.target.getDuration();
      if (d > 0) s.duration = d;
      var m1 = App.modes[s.appMode];
      if (m1 && m1.onPlaying) m1.onPlaying();
    } else if (event.data === 2) { // PAUSED
      s.isPlaying = false;
    } else if (event.data === 0) { // ENDED
      s.isPlaying = false;
      var m2 = App.modes[s.appMode];
      if (m2 && m2.onEnded) m2.onEnded();
    }
    App.updatePlayPauseIcon();
  },

  onPlayerError: function(event) {
    var code = event.data;
    var msg;
    if (code === 100) msg = 'Video not found or removed';
    else if (code === 101 || code === 150) msg = 'Video cannot be embedded';
    else msg = 'Playback error (' + code + ')';
    // 通知當前模式（若有 onError hook 也可以呼叫；目前先 console）
    console.warn(msg);
    var m = App.modes[App.state.appMode];
    if (m && m.onError) m.onError(msg);
  },

  // ── Time Polling (500ms) ──
  startTimePolling: function() {
    var s = App.state;
    if (s._timeInterval) clearInterval(s._timeInterval);
    s._timeInterval = setInterval(function() {
      if (!s.player || !s.player.getCurrentTime) return;
      s.currentTime = s.player.getCurrentTime();
      s.duration = s.player.getDuration() || s.duration;
      App.updateTimeDisplay();
      var m = App.modes[s.appMode];
      if (m && m.onActivePoll) m.onActivePoll();
    }, 500);
  },

  // ── Player Bar Controls ──
  togglePlayPause: function() {
    var s = App.state;
    if (!s.player) return;
    if (s.isPlaying) {
      s.player.pauseVideo();
      s.isPlaying = false;
    } else {
      s.player.playVideo();
      s.isPlaying = true;
    }
    App.updatePlayPauseIcon();
  },

  seekTo: function(seconds) {
    var s = App.state;
    if (!s.player) return;
    s.player.seekTo(seconds, true);
    s.currentTime = seconds;
    App.updateTimeDisplay();
  },

  setVolumeTo: function(val) {
    var s = App.state;
    s.volume = Math.max(0, Math.min(100, val));
    if (s.player && s.player.setVolume) s.player.setVolume(s.volume);
    if (s.volume > 0 && s.isMuted) {
      s.isMuted = false;
      if (s.player && s.player.unMute) s.player.unMute();
    }
    try { localStorage.setItem('prism_volume', String(s.volume)); } catch(e) {}
    try { localStorage.setItem('prism_muted', String(s.isMuted)); } catch(e) {}
    App.updateVolSliderBg();
    App.updateVolIcon();
  },

  toggleMute: function() {
    var s = App.state;
    s.isMuted = !s.isMuted;
    if (s.player) {
      if (s.isMuted) { s.player.mute && s.player.mute(); }
      else { s.player.unMute && s.player.unMute(); }
    }
    try { localStorage.setItem('prism_muted', String(s.isMuted)); } catch(e) {}
    App.updateVolIcon();
  },

  // ── 共用 UI 更新 ──
  updatePlayPauseIcon: function() {
    var s = App.state;
    var el = App.el;
    el.iconPlay.style.display = s.isPlaying ? 'none' : 'block';
    el.iconPause.style.display = s.isPlaying ? 'block' : 'none';
    el.playPauseBtn.title = s.isPlaying ? 'Pause' : 'Play';
  },

  updateTimeDisplay: function() {
    var s = App.state;
    var el = App.el;
    var pct = s.duration > 0 ? (s.currentTime / s.duration) * 100 : 0;
    var clamped = Math.min(100, Math.max(0, pct));
    el.progressFill.style.width = clamped + '%';
    el.progressScrubber.style.left = clamped + '%';
    el.timeCurrent.textContent = App.formatTime(s.currentTime);
    el.timeTotal.textContent = s.duration > 0 ? App.formatTime(s.duration) : '--:--';
  },

  updateVolSliderBg: function() {
    var s = App.state;
    var pct = s.isMuted ? 0 : s.volume;
    App.el.volSlider.style.background =
      'linear-gradient(90deg, var(--accent-pink-light) ' + pct + '%, var(--border-default) ' + pct + '%)';
  },

  updateVolIcon: function() {
    var s = App.state;
    var el = App.el;
    var show = s.isMuted ? 'muted' : (s.volume > 50 ? 'high' : 'low');
    el.iconVolHigh.style.display = show === 'high' ? 'block' : 'none';
    el.iconVolLow.style.display = show === 'low' ? 'block' : 'none';
    el.iconVolMuted.style.display = show === 'muted' ? 'block' : 'none';
  },

  renderAnchorMarkers: function() {
    var pb = App.el.progressBar;
    if (!pb) return;
    // 清掉舊 markers（共用）
    var old = pb.querySelectorAll('.progress-anchor-marker');
    for (var i = 0; i < old.length; i++) old[i].remove();
    // 分派給當前模式畫
    var m = App.modes[App.state.appMode];
    if (m && m.onAnchorMarkers) m.onAnchorMarkers();
  },

  // ── 模式切換 ──
  setAppMode: function(mode) {
    App.state.appMode = mode;
    document.querySelectorAll('.mode-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    var mainContent = document.querySelector('.main-content');
    var playlistContent = document.getElementById('main-content-playlist');
    if (mainContent) mainContent.style.display = mode === 'timestamp' ? '' : 'none';
    if (playlistContent) playlistContent.style.display = mode === 'playlist' ? '' : 'none';
    document.querySelectorAll('.mode-only-playlist').forEach(function(el) {
      el.style.display = mode === 'playlist' ? '' : 'none';
    });
    try { localStorage.setItem('prism_mode', mode); } catch(e) {}
    // 切換時重畫 markers + 重抓 title
    App.renderAnchorMarkers();
    var m = App.modes[mode];
    if (m && m.onPlaying) m.onPlaying();
  },

  // ── 初始化（DOMContentLoaded 時呼叫）──
  init: function() {
    var s = App.state;
    var el = App.el;

    // 1. 抓 DOM refs
    el.playerBar = document.getElementById('player-bar');
    el.playPauseBtn = document.getElementById('play-pause-btn');
    el.prevBtn = document.getElementById('prev-btn');
    el.nextBtn = document.getElementById('next-btn');
    el.iconPlay = document.getElementById('icon-play');
    el.iconPause = document.getElementById('icon-pause');
    el.timeCurrent = document.getElementById('time-current');
    el.timeTotal = document.getElementById('time-total');
    el.progressBar = document.getElementById('progress-bar');
    el.progressFill = document.getElementById('progress-fill');
    el.progressScrubber = document.getElementById('progress-scrubber');
    el.volBtn = document.getElementById('vol-btn');
    el.volSlider = document.getElementById('vol-slider');
    el.iconVolHigh = document.getElementById('icon-vol-high');
    el.iconVolLow = document.getElementById('icon-vol-low');
    el.iconVolMuted = document.getElementById('icon-vol-muted');
    el.playerTitle = document.getElementById('player-title');
    el.playerSubtitle = document.getElementById('player-subtitle');

    // 2. 從 localStorage 載入 volume / muted / mode
    try {
      var sv = localStorage.getItem('prism_volume');
      if (sv !== null) { s.volume = Number(sv); el.volSlider.value = s.volume; }
      var sm = localStorage.getItem('prism_muted');
      if (sm === 'true') s.isMuted = true;
      var smode = localStorage.getItem('prism_mode');
      if (smode === 'timestamp' || smode === 'playlist') s.appMode = smode;
    } catch(e) {}
    App.updateVolSliderBg();
    App.updateVolIcon();

    // 3. 共用事件監聽（player bar）
    el.playPauseBtn.addEventListener('click', App.togglePlayPause);
    el.prevBtn.addEventListener('click', function() {
      var m = App.modes[s.appMode];
      if (m && m.onPrev) m.onPrev();
    });
    el.nextBtn.addEventListener('click', function() {
      var m = App.modes[s.appMode];
      if (m && m.onNext) m.onNext();
    });

    // Progress bar: click / drag to seek
    var isDraggingProgress = false;
    function seekFromEvent(e) {
      var rect = el.progressBar.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      App.seekTo(pct * s.duration);
    }
    el.progressBar.addEventListener('mousedown', function(e) {
      isDraggingProgress = true;
      seekFromEvent(e);
    });
    document.addEventListener('mousemove', function(e) {
      if (isDraggingProgress) seekFromEvent(e);
    });
    document.addEventListener('mouseup', function() {
      isDraggingProgress = false;
    });
    el.progressBar.addEventListener('touchstart', function(e) {
      isDraggingProgress = true;
      seekFromEvent(e);
    }, { passive: true });
    el.progressBar.addEventListener('touchmove', function(e) {
      if (isDraggingProgress) seekFromEvent(e);
    }, { passive: true });
    el.progressBar.addEventListener('touchend', function() {
      isDraggingProgress = false;
    });

    // Volume
    el.volSlider.addEventListener('input', function() {
      App.setVolumeTo(Number(this.value));
    });
    el.volBtn.addEventListener('click', function() {
      App.toggleMute();
      App.updateVolSliderBg();
    });

    // 鍵盤快捷鍵
    document.addEventListener('keydown', function(e) {
      var active = document.activeElement;
      var isInput = active instanceof HTMLInputElement ||
                    active instanceof HTMLTextAreaElement ||
                    active instanceof HTMLSelectElement;

      if (e.code === 'Space' && !isInput && s.player) {
        e.preventDefault();
        App.togglePlayPause();
      }

      if (e.key === 'ArrowLeft' && !isInput && s.player) {
        e.preventDefault();
        App.seekTo(Math.max(0, s.currentTime - 5));
      }

      if (e.key === 'ArrowRight' && !isInput && s.player) {
        e.preventDefault();
        App.seekTo(Math.min(s.duration, s.currentTime + 5));
      }
    });

    // 4. 模式切換按鈕
    document.querySelectorAll('.mode-btn').forEach(function(b) {
      b.addEventListener('click', function() { App.setAppMode(b.dataset.mode); });
    });
    App.setAppMode(s.appMode);

    // 5. 載入 YT API
    App.loadYTApi();
  },
};

// YT IFrame API 全域 callback
window.onYouTubeIframeAPIReady = function() { App.state.apiReady = true; };

document.addEventListener('DOMContentLoaded', App.init);
