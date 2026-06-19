class YubaPlayer {
    constructor() {
        this.audio = document.getElementById('audioEngine');
        this.playlist = [];      // [{ entry, title, artist, duration }]
        this.filtered = [];      // indices into this.playlist, post-search
        this.currentIndex = -1;  // index into this.filtered
        this.isShuffle = false;
        this.isRepeat = false;
        this.artCache = new Map(); // title-key -> artwork url, avoids refetching
        this.searchDebounce = null;
        this.setup();
        this.restoreTheme();
    }

    setup() {
        const folderBtn = document.getElementById('folderBtn');
        const searchInput = document.getElementById('searchInput');
        const themeToggle = document.getElementById('themeToggle');
        const playBtn = document.getElementById('playBtn');
        const nextBtn = document.getElementById('nextBtn');
        const prevBtn = document.getElementById('prevBtn');
        const shuffleBtn = document.getElementById('shuffleBtn');
        const repeatBtn = document.getElementById('repeatBtn');
        const progressRail = document.getElementById('progressRail');
        const playlistEl = document.getElementById('playlist');

        folderBtn.onclick = () => this.loadFolder();

        searchInput.oninput = (e) => {
            clearTimeout(this.searchDebounce);
            const val = e.target.value;
            this.searchDebounce = setTimeout(() => this.applySearch(val), 120);
        };

        themeToggle.onclick = () => this.toggleTheme();

        playBtn.onclick = () => this.toggle();
        nextBtn.onclick = () => this.next();
        prevBtn.onclick = () => this.prev();

        if (shuffleBtn) {
            shuffleBtn.onclick = () => {
                this.isShuffle = !this.isShuffle;
                shuffleBtn.classList.toggle('active', this.isShuffle);
                shuffleBtn.setAttribute('aria-pressed', String(this.isShuffle));
            };
        }

        if (repeatBtn) {
            repeatBtn.onclick = () => {
                this.isRepeat = !this.isRepeat;
                repeatBtn.classList.toggle('active', this.isRepeat);
                repeatBtn.setAttribute('aria-pressed', String(this.isRepeat));
            };
        }

        // Delegated click instead of inline onclick — survives re-renders,
        // doesn't depend on a global `player` reference, no string interpolation of filenames into HTML attrs.
        playlistEl.addEventListener('click', (e) => {
            const row = e.target.closest('.track-item');
            if (!row) return;
            const idx = Number(row.dataset.index);
            if (!Number.isNaN(idx)) this.playFiltered(idx);
        });

        playlistEl.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const row = e.target.closest('.track-item');
            if (!row) return;
            e.preventDefault();
            const idx = Number(row.dataset.index);
            if (!Number.isNaN(idx)) this.playFiltered(idx);
        });

        this.audio.ontimeupdate = () => this.syncProgress();
        this.audio.onended = () => this.handleEnded();
        this.audio.onerror = () => this.handlePlaybackError();
        this.audio.onloadedmetadata = () => this.syncProgress();

        let seeking = false;
        const seekTo = (clientX) => {
            const rect = progressRail.getBoundingClientRect();
            const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            if (!isNaN(this.audio.duration)) {
                this.audio.currentTime = pct * this.audio.duration;
                this.syncProgress();
            }
        };
        progressRail.addEventListener('mousedown', (e) => { seeking = true; seekTo(e.clientX); });
        window.addEventListener('mousemove', (e) => { if (seeking) seekTo(e.clientX); });
        window.addEventListener('mouseup', () => { seeking = false; });

        // basic keyboard transport: space to play/pause, arrows to skip
        // (only when focus isn't in the search box, so typing isn't hijacked)
        window.addEventListener('keydown', (e) => {
            if (document.activeElement === searchInput) return;
            if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
            if (e.code === 'ArrowRight' && e.shiftKey) this.next();
            if (e.code === 'ArrowLeft' && e.shiftKey) this.prev();
        });
    }

    async loadFolder() {
        let dir;
        try {
            dir = await window.showDirectoryPicker();
        } catch (e) {
            // user cancelled the picker — not an error worth surfacing
            return;
        }

        const trackCountEl = document.getElementById('trackCount');
        trackCountEl.innerText = 'Scanning…';

        const entries = [];
        for await (const entry of dir.values()) {
            if (entry.kind === 'file' && /\.(mp3|wav|flac|m4a|ogg)$/i.test(entry.name)) {
                entries.push(entry);
            }
        }
        entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        this.playlist = entries.map(entry => ({
            entry,
            title: this.parseTitle(entry.name),
            artist: 'Unknown Artist',
            duration: null,
        }));

        this.filtered = this.playlist.map((_, i) => i);
        this.currentIndex = -1;
        this.render();
        trackCountEl.innerText = `${this.playlist.length} Song${this.playlist.length === 1 ? '' : 's'}`;

        // fetch durations in the background without blocking the UI
        this.hydrateDurations();
    }

    parseTitle(filename) {
        return filename.replace(/\.[^/.]+$/, '');
    }

    applySearch(rawVal) {
        const val = rawVal.trim().toLowerCase();
        this.filtered = this.playlist
            .map((track, i) => ({ track, i }))
            .filter(({ track }) => track.title.toLowerCase().includes(val))
            .map(({ i }) => i);
        this.render();
    }

    async hydrateDurations() {
        // Reads duration metadata for visible tracks via a throwaway Audio element,
        // a few at a time so we don't open dozens of file handles at once.
        const CONCURRENCY = 3;
        let cursor = 0;
        const worker = async () => {
            while (cursor < this.playlist.length) {
                const i = cursor++;
                const track = this.playlist[i];
                if (track.duration != null) continue;
                try {
                    const file = await track.entry.getFile();
                    const url = URL.createObjectURL(file);
                    const dur = await this.readDuration(url);
                    track.duration = dur;
                    URL.revokeObjectURL(url);
                    this.updateDurationCell(i, dur);
                } catch (e) {
                    track.duration = NaN;
                }
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    }

    readDuration(url) {
        return new Promise((resolve, reject) => {
            const probe = new Audio();
            probe.preload = 'metadata';
            probe.src = url;
            probe.onloadedmetadata = () => resolve(probe.duration);
            probe.onerror = () => reject(new Error('metadata read failed'));
        });
    }

    updateDurationCell(playlistIndex, duration) {
        const filteredPos = this.filtered.indexOf(playlistIndex);
        if (filteredPos === -1) return;
        const row = document.getElementById(`t-${filteredPos}`);
        if (!row) return;
        const cell = row.querySelector('.track-duration');
        if (cell) cell.textContent = isNaN(duration) ? '--:--' : this.fmt(duration);
    }

    render() {
        const list = document.getElementById('playlist');

        if (this.filtered.length === 0) {
            list.innerHTML = `<div class="empty-state">No tracks match. Try a different search, or load a folder.</div>`;
            return;
        }

        list.innerHTML = this.filtered.map((playlistIndex, i) => {
            const track = this.playlist[playlistIndex];
            const isActive = playlistIndex === this.currentIndex;
            const indexCell = isActive
                ? `<span class="bar"></span><span class="bar"></span><span class="bar"></span>`
                : String(i + 1).padStart(2, '0');
            const durationText = track.duration == null ? '' : (isNaN(track.duration) ? '--:--' : this.fmt(track.duration));

            return `
                <div class="track-item${isActive ? ' active' : ''}" id="t-${i}" data-index="${i}" tabindex="0" role="button" aria-pressed="${isActive}">
                    <span class="track-index">${indexCell}</span>
                    <div class="track-info">
                        <div class="track-title"></div>
                        <div class="track-artist"></div>
                    </div>
                    <span class="track-duration">${durationText}</span>
                </div>
            `;
        }).join('');

        // set text via textContent, not template interpolation, so filenames
        // with < > & " etc. can't break out of the markup
        this.filtered.forEach((playlistIndex, i) => {
            const track = this.playlist[playlistIndex];
            const row = document.getElementById(`t-${i}`);
            row.querySelector('.track-title').textContent = track.title;
            row.querySelector('.track-artist').textContent = track.artist;
        });
    }

    async playFiltered(filteredPos) {
        const playlistIndex = this.filtered[filteredPos];
        if (playlistIndex == null) return;
        await this.play(playlistIndex);
    }

    async play(playlistIndex) {
        const track = this.playlist[playlistIndex];
        if (!track) return;
        this.currentIndex = playlistIndex;

        try {
            const file = await track.entry.getFile();
            // release the previous blob URL so memory doesn't grow unbounded
            // across a long listening session
            if (this.audio.src) URL.revokeObjectURL(this.audio.src);
            this.audio.src = URL.createObjectURL(file);
        } catch (e) {
            this.handlePlaybackError();
            return;
        }

        document.getElementById('activeTitle').innerText = track.title;
        document.getElementById('activeArtist').innerText = track.artist;

        this.intelligentArt(track.title);
        this.render();

        try {
            await this.audio.play();
            document.getElementById('playBtn').innerHTML = '<i class="fas fa-pause"></i>';
        } catch (e) {
            // Autoplay can be blocked until a user gesture; reflect paused state
            // instead of leaving a stale "playing" icon.
            document.getElementById('playBtn').innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    async intelligentArt(title) {
        const artEl = document.getElementById('albumArt');
        let clean = title.split(/[-_(]/)[0].replace(/\d+/g, '').trim();
        if (clean.length < 3) clean = title.slice(0, 10);

        if (this.artCache.has(clean)) {
            artEl.src = this.artCache.get(clean);
            return;
        }

        // reset to a placeholder immediately so stale art from the previous
        // track doesn't linger while the new lookup is in flight
        artEl.src = 'assets/placeholder-art.svg';

        try {
            const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(clean)}&entity=musicTrack&limit=1`);
            if (!res.ok) throw new Error(`iTunes lookup failed: ${res.status}`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                const highRes = data.results[0].artworkUrl100.replace('100x100', '600x600');
                this.artCache.set(clean, highRes);
                // guard against a slower lookup resolving after the user has
                // already skipped to another track
                if (document.getElementById('activeTitle').innerText === title) {
                    artEl.src = highRes;
                }
            }
        } catch (e) {
            console.warn('Art search failed', e);
        }
    }

    toggle() {
        if (this.currentIndex === -1) {
            if (this.filtered.length > 0) this.playFiltered(0);
            return;
        }
        if (this.audio.paused) {
            this.audio.play().catch(() => {});
            document.getElementById('playBtn').innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            this.audio.pause();
            document.getElementById('playBtn').innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    handleEnded() {
        if (this.isRepeat) {
            this.audio.currentTime = 0;
            this.audio.play().catch(() => {});
            return;
        }
        this.next();
    }

    handlePlaybackError() {
        console.warn('Playback error on track', this.currentIndex);
        document.getElementById('playBtn').innerHTML = '<i class="fas fa-play"></i>';
    }

    next() {
        if (this.filtered.length === 0) return;
        const curPos = this.filtered.indexOf(this.currentIndex);
        let nextPos;
        if (this.isShuffle && this.filtered.length > 1) {
            do {
                nextPos = Math.floor(Math.random() * this.filtered.length);
            } while (nextPos === curPos);
        } else {
            nextPos = curPos + 1 >= this.filtered.length ? 0 : curPos + 1;
        }
        this.playFiltered(nextPos);
    }

    prev() {
        if (this.filtered.length === 0) return;
        const curPos = this.filtered.indexOf(this.currentIndex);
        const prevPos = curPos - 1 < 0 ? this.filtered.length - 1 : curPos - 1;
        this.playFiltered(prevPos);
    }

    syncProgress() {
        const { currentTime, duration } = this.audio;
        if (isNaN(duration)) return;
        document.getElementById('progressFill').style.width = `${(currentTime / duration) * 100}%`;
        document.getElementById('currentTime').innerText = this.fmt(currentTime);
        document.getElementById('duration').innerText = this.fmt(duration);
    }

    fmt(s) {
        if (isNaN(s)) return '--:--';
        const m = Math.floor(s / 60);
        const r = Math.floor(s % 60);
        return `${m}:${r < 10 ? '0' : ''}${r}`;
    }

    toggleTheme() {
        const mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', mode);
        document.querySelector('#themeToggle i').className = mode === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        localStorage.setItem('yuba-theme', mode);
    }

    restoreTheme() {
        const saved = localStorage.getItem('yuba-theme');
        const mode = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', mode);
        const icon = document.querySelector('#themeToggle i');
        if (icon) icon.className = mode === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

const player = new YubaPlayer();
