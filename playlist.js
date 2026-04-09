// ─────────────────────────────────────────────────────────────
// playlist.js — 播放清單模式（新功能）
// 多首歌一首一個 URL，可循環/隨機播放，匯出/匯入 .json
// ─────────────────────────────────────────────────────────────

window.PlaylistMode = {
  // ── 私有 State ──
  songs: [],                  // [{ id, url, title }]
  currentIndex: -1,
  repeatMode: 'off',          // 'off' | 'all' | 'one'
  shuffleEnabled: false,
  shuffleOrder: [],
  shufflePos: 0,

  // ── DOM refs（init 時填入）──
  el: {
    urlInput: null, addBtn: null, clearBtn: null, exportBtn: null, importFile: null,
    listEl: null, emptyEl: null, countEl: null, errorEl: null,
    shuffleBtn: null, repeatBtn: null,
    repeatIconAll: null, repeatIconOne: null,
  },

  // ── 核心函式 ──
  addSingle: function(url) {
    var P = PlaylistMode;
    if (!url) return false;
    var id = App.extractVideoId(url);
    if (!id) { P.showError('無效的 YouTube 連結'); return false; }
    if (P.songs.some(function(s) { return s.id === id; })) {
      P.showError('歌曲已在清單中');
      return false;
    }
    P.songs.push({ id: id, url: url, title: 'Loading…' });
    if (P.shuffleEnabled) P.shuffleOrder.push(P.songs.length - 1);
    P.showError('');
    P.render();
    return true;
  },

  remove: function(idx) {
    var P = PlaylistMode;
    var wasCurrent = (idx === P.currentIndex);
    P.songs.splice(idx, 1);

    // 修正 shuffleOrder：移除該值，並把 > idx 的值都減 1
    P.shuffleOrder = P.shuffleOrder
      .filter(function(v) { return v !== idx; })
      .map(function(v) { return v > idx ? v - 1 : v; });

    if (idx < P.currentIndex) {
      P.currentIndex--;
    } else if (wasCurrent) {
      if (P.songs.length === 0) {
        P.stopAtEnd();
        P.currentIndex = -1;
      } else {
        if (P.currentIndex >= P.songs.length) P.currentIndex = 0;
        P.playIndex(P.currentIndex);
      }
    }
    // 修正 shufflePos
    if (P.shufflePos >= P.shuffleOrder.length) P.shufflePos = Math.max(0, P.shuffleOrder.length - 1);
    P.render();
  },

  clear: function() {
    var P = PlaylistMode;
    P.songs = [];
    P.shuffleOrder = [];
    P.shufflePos = 0;
    P.currentIndex = -1;
    P.stopAtEnd();
    P.render();
  },

  render: function() {
    var P = PlaylistMode;
    var el = P.el;
    el.listEl.innerHTML = '';
    el.emptyEl.style.display = P.songs.length === 0 ? 'block' : 'none';
    el.countEl.textContent = P.songs.length ? '(' + P.songs.length + ')' : '';
    P.songs.forEach(function(song, i) {
      var li = document.createElement('li');
      li.className = 'playlist-item' + (i === P.currentIndex ? ' active' : '');
      li.innerHTML =
        '<img class="pl-thumb" src="https://i.ytimg.com/vi/' + song.id + '/default.jpg" alt="">' +
        '<span class="pl-index">' + (i + 1) + '</span>' +
        '<span class="pl-title">' + App.escapeHtml(song.title) + '</span>' +
        '<button class="pl-delete" title="Delete">&times;</button>';
      li.addEventListener('click', function(e) {
        if (e.target.classList.contains('pl-delete')) {
          P.remove(i);
          return;
        }
        P.playIndex(i);
      });
      el.listEl.appendChild(li);
    });
  },

  playIndex: function(idx) {
    var P = PlaylistMode;
    if (idx < 0 || idx >= P.songs.length) return;
    P.currentIndex = idx;
    var song = P.songs[idx];
    App.el.playerTitle.textContent = song.title;
    App.el.playerSubtitle.textContent = '';
    App.loadVideo(song.id);
    P.render();
    if (P.shuffleEnabled) {
      var pos = P.shuffleOrder.indexOf(idx);
      if (pos >= 0) P.shufflePos = pos;
    }
  },

  next: function() {
    var P = PlaylistMode;
    if (P.songs.length === 0) return;
    if (P.currentIndex === -1) { P.playIndex(0); return; }
    if (P.repeatMode === 'one') {
      App.seekTo(0);
      if (App.state.player && App.state.player.playVideo) App.state.player.playVideo();
      return;
    }
    if (P.shuffleEnabled) {
      P.shufflePos++;
      if (P.shufflePos >= P.shuffleOrder.length) {
        if (P.repeatMode === 'all') {
          P.rebuildShuffleOrder();
          P.shufflePos = 0;
        } else {
          P.stopAtEnd();
          return;
        }
      }
      P.playIndex(P.shuffleOrder[P.shufflePos]);
    } else {
      var nxt = P.currentIndex + 1;
      if (nxt >= P.songs.length) {
        if (P.repeatMode === 'all') {
          nxt = 0;
        } else {
          P.stopAtEnd();
          return;
        }
      }
      P.playIndex(nxt);
    }
  },

  prev: function() {
    var P = PlaylistMode;
    if (P.songs.length === 0) return;
    if (P.currentIndex === -1) { P.playIndex(0); return; }
    if (P.repeatMode === 'one') {
      App.seekTo(0);
      return;
    }
    if (P.shuffleEnabled) {
      P.shufflePos--;
      if (P.shufflePos < 0) P.shufflePos = P.shuffleOrder.length - 1;
      P.playIndex(P.shuffleOrder[P.shufflePos]);
    } else {
      var prv = P.currentIndex - 1;
      if (prv < 0) prv = P.songs.length - 1;
      P.playIndex(prv);
    }
  },

  stopAtEnd: function() {
    if (App.state.player && App.state.player.pauseVideo) App.state.player.pauseVideo();
    App.state.isPlaying = false;
    App.updatePlayPauseIcon();
  },

  rebuildShuffleOrder: function() {
    var P = PlaylistMode;
    P.shuffleOrder = P.songs.map(function(_, i) { return i; });
    for (var i = P.shuffleOrder.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = P.shuffleOrder[i];
      P.shuffleOrder[i] = P.shuffleOrder[j];
      P.shuffleOrder[j] = t;
    }
    if (P.currentIndex >= 0) {
      var pos = P.shuffleOrder.indexOf(P.currentIndex);
      if (pos >= 0) P.shufflePos = pos;
    } else {
      P.shufflePos = 0;
    }
  },

  cycleRepeat: function() {
    var P = PlaylistMode;
    P.repeatMode = ({ off: 'all', all: 'one', one: 'off' })[P.repeatMode];
    P.updateRepeatBtn();
    try { localStorage.setItem('prism_repeat', P.repeatMode); } catch(e) {}
  },

  toggleShuffle: function() {
    var P = PlaylistMode;
    P.shuffleEnabled = !P.shuffleEnabled;
    if (P.shuffleEnabled) P.rebuildShuffleOrder();
    P.updateShuffleBtn();
    try { localStorage.setItem('prism_shuffle', String(P.shuffleEnabled)); } catch(e) {}
  },

  updateShuffleBtn: function() {
    PlaylistMode.el.shuffleBtn.classList.toggle('active', PlaylistMode.shuffleEnabled);
  },

  updateRepeatBtn: function() {
    var P = PlaylistMode;
    P.el.repeatBtn.classList.toggle('active', P.repeatMode !== 'off');
    P.el.repeatBtn.title = 'Repeat: ' + P.repeatMode;
    if (P.el.repeatIconAll && P.el.repeatIconOne) {
      P.el.repeatIconAll.style.display = P.repeatMode === 'one' ? 'none' : 'block';
      P.el.repeatIconOne.style.display = P.repeatMode === 'one' ? 'block' : 'none';
    }
  },

  showError: function(msg) {
    var el = PlaylistMode.el.errorEl;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  },

  // ── 切離模式時的 cleanup（由 core.js setAppMode 呼叫）──
  onLeave: function() {
    var P = PlaylistMode;
    P.currentIndex = -1;
    P.shufflePos = 0;
    P.render();
  },

  // ── Title 取得：當歌曲開始播放時，從 player.getVideoData() 補上真實 title ──
  onPlayingHook: function() {
    var P = PlaylistMode;
    if (P.currentIndex < 0) return;
    try {
      var data = App.state.player && App.state.player.getVideoData && App.state.player.getVideoData();
      if (data && data.title) {
        P.songs[P.currentIndex].title = data.title;
        App.el.playerTitle.textContent = data.title;
        App.el.playerSubtitle.textContent = data.author || '';
        P.render();
      }
    } catch(e) {}
  },

  // ── Export / Import ──
  exportPlaylist: function() {
    var P = PlaylistMode;
    if (P.songs.length === 0) return;
    var data = {
      type: 'playlist',
      songs: P.songs.map(function(s) {
        return { id: s.id, url: s.url, title: s.title };
      }),
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'playlist_' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  },

  importPlaylist: function(file) {
    var P = PlaylistMode;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (data.type !== 'playlist' || !Array.isArray(data.songs)) {
          P.showError('檔案格式錯誤');
          return;
        }
        P.songs = data.songs
          .filter(function(s) { return s && s.id; })
          .map(function(s) {
            return { id: s.id, url: s.url || '', title: s.title || 'Loading…' };
          });
        P.currentIndex = -1;
        P.shufflePos = 0;
        if (P.shuffleEnabled) P.rebuildShuffleOrder();
        P.showError('');
        P.render();
      } catch(err) {
        P.showError('無法解析 JSON');
      }
    };
    reader.readAsText(file);
  },

  // ── 初始化 ──
  init: function() {
    var P = PlaylistMode;
    var el = P.el;

    // 1. 抓 DOM
    el.urlInput = document.getElementById('playlist-url-input');
    el.addBtn = document.getElementById('playlist-add-btn');
    el.clearBtn = document.getElementById('playlist-clear-btn');
    el.exportBtn = document.getElementById('playlist-export-btn');
    el.importFile = document.getElementById('playlist-import-file');
    el.listEl = document.getElementById('playlist-list');
    el.emptyEl = document.getElementById('playlist-empty');
    el.countEl = document.getElementById('playlist-count');
    el.errorEl = document.getElementById('playlist-error');
    el.shuffleBtn = document.getElementById('shuffle-btn');
    el.repeatBtn = document.getElementById('repeat-btn');
    el.repeatIconAll = document.getElementById('icon-repeat-all');
    el.repeatIconOne = document.getElementById('icon-repeat-one');

    // 2. 載入偏好（不還原 playlist 本身）
    try {
      var r = localStorage.getItem('prism_repeat');
      if (r === 'off' || r === 'all' || r === 'one') P.repeatMode = r;
      var s = localStorage.getItem('prism_shuffle');
      if (s === 'true') P.shuffleEnabled = true;
    } catch(e) {}
    P.updateRepeatBtn();
    P.updateShuffleBtn();

    // 3. 事件
    el.addBtn.addEventListener('click', function() {
      if (P.addSingle(el.urlInput.value.trim())) el.urlInput.value = '';
    });
    el.urlInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') el.addBtn.click();
    });
    el.clearBtn.addEventListener('click', P.clear);
    el.exportBtn.addEventListener('click', P.exportPlaylist);
    el.importFile.addEventListener('change', function(e) {
      if (e.target.files[0]) P.importPlaylist(e.target.files[0]);
      e.target.value = '';
    });
    el.shuffleBtn.addEventListener('click', P.toggleShuffle);
    el.repeatBtn.addEventListener('click', P.cycleRepeat);

    // 4. 渲染初始空清單
    P.render();

    // 5. 註冊到 Modes registry
    App.modes.playlist = {
      onPrev:          P.prev,
      onNext:          P.next,
      onEnded:         P.next,             // 歌結束自動下一首
      onPlaying:       P.onPlayingHook,    // 抓 title
      onActivePoll:    function() {},      // 不需要
      onAnchorMarkers: function() {},      // 不畫 markers
      onLeave:         P.onLeave,
    };
  },
};

document.addEventListener('DOMContentLoaded', PlaylistMode.init);
