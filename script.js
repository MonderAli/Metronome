document.addEventListener('DOMContentLoaded', () => {
    // Register service worker for PWA (if available)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
    }

    const bpmInput = document.getElementById('bpm');
    const tempoPreset = document.getElementById('tempoPreset');
    const startBtn = document.getElementById('start');
    const numeratorInput = document.getElementById('numerator');
    const denominatorSelect = document.getElementById('denominator');

    if (!bpmInput || !tempoPreset || !startBtn || !numeratorInput || !denominatorSelect) return;

    // Audio / scheduling state
    let audioCtx = null;
    let isRunning = false;
    const lookahead = 25; // ms
    const scheduleAheadTime = 0.1; // seconds
    let timerID = null;
    let nextNoteTime = 0.0; // when the next click should play (audio time)
    let beatIndex = 0; // current beat within measure

    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function calcSecondsPerBeat() {
        const bpm = Math.max(1, Number(bpmInput.value) || 120);
        const denom = Number(denominatorSelect.value) || 4;
        return 60.0 / bpm * (4 / denom);
    }

    // Schedule any notes that fall within the scheduleAheadTime window
    function scheduler() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        const numerator = Math.max(1, parseInt(numeratorInput.value) || 4);
        const secondsPerBeat = calcSecondsPerBeat();

        while (nextNoteTime < now + scheduleAheadTime) {
            const isAccent = (beatIndex % numerator) === 0;
            scheduleClick(nextNoteTime, isAccent);
            nextNoteTime += secondsPerBeat;
            beatIndex = (beatIndex + 1) % numerator;
        }
    }

    // Create a short click using an oscillator and a gain envelope
    function scheduleClick(time, isAccent) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'square';
        osc.frequency.value = isAccent ? 1200 : 900;

        // Connect
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        // Envelope (very short click)
        const attack = 0.001;
        const decay = isAccent ? 0.08 : 0.06;
        const peak = isAccent ? 0.9 : 0.4;

        // Start with near-zero to avoid clicks on some platforms
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(peak, time + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);

        osc.start(time);
        // Stop shortly after the envelope ends
        osc.stop(time + attack + decay + 0.02);
    }

    // Start/stop handlers
    startBtn.addEventListener('click', async () => {
        if (!isRunning) {
            initAudio();
            // resume (required by many browsers on user gesture)
            await audioCtx.resume();

            // initialize scheduling state
            nextNoteTime = audioCtx.currentTime + 0.05; // small offset
            beatIndex = 0;

            // start lookahead scheduler
            timerID = setInterval(scheduler, lookahead);
            isRunning = true;
            startBtn.textContent = 'Stop';
        } else {
            clearInterval(timerID);
            timerID = null;
            isRunning = false;
            startBtn.textContent = 'Start';
        }
    });

    // Wire preset -> bpm (preserve existing behavior)
    tempoPreset.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value !== '') {
            bpmInput.value = value;
            bpmInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    // Update tempo calculations when BPM or denominator change
    bpmInput.addEventListener('input', () => {
        // We update secondsPerBeat on the fly inside scheduler; no further action needed here.
    });
    denominatorSelect.addEventListener('change', () => {
        // scheduler will pick up the new denominator automatically
    });
    numeratorInput.addEventListener('input', () => {
        // ensure numerator is at least 1
        if (Number(numeratorInput.value) < 1) numeratorInput.value = '1';
    });
});

