// Import pipeline from Xenova Transformers CDN (stable version)
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// --- UI Navigation ---
function showSection(secId) {
    document.querySelectorAll('section').forEach(s => (s.style.display = 'none'));
    const active = document.getElementById(secId);
    if (active) active.style.display = 'block';
}

document.getElementById('menuAbout')?.addEventListener('click', () => showSection('aboutPage'));
document.getElementById('menuInsert')?.addEventListener('click', () => showSection('insertPage'));
document.getElementById('menuTools')?.addEventListener('click', () => showSection('toolsPage'));

// --- Main AI Logic ---
(async () => {
    const respDiv = document.getElementById('aiResponse');
    const askBtn = document.getElementById('askAIButton');
    const clearBtn = document.getElementById('clearAIButton');
    const queryInput = document.getElementById('aiQuery');

    if (!respDiv || !askBtn || !queryInput) {
        const msg = '❌ Error: Missing required DOM elements (aiResponse, askAIButton, or aiQuery)';
        console.error(msg);
        if (respDiv) respDiv.textContent = msg;
        return;
    }

    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingProgress';
    loadingDiv.style.display = 'none';
    respDiv.parentNode.insertBefore(loadingDiv, respDiv.nextSibling);

    respDiv.style.display = 'block';
    respDiv.textContent = '⏳ Loading AI model (this may take 1–2 minutes)...';
    askBtn.disabled = true;

    let generator;
    try {
        generator = await pipeline('text-generation', 'Xenova/bloomz-560m', {
            progress_callback: progress => {
                if (progress.status === 'downloading') {
                    const percent = Math.round(progress.progress * 100);
                    respDiv.textContent = `⏳ Downloading model: ${percent}%`;
                }
            }
        });
        respDiv.textContent = '✅ AI is ready. Please ask your devotional question.';
        askBtn.disabled = false;
    } catch (err) {
        console.warn('⚠ Model load failed, using fallback model...', err.message);
        try {
            generator = await pipeline('text-generation', 'Xenova/distilbert-base-uncased');
            respDiv.textContent = '⚠ Fallback model loaded. Ask simple questions in English.';
            askBtn.disabled = false;
        } catch (err2) {
            respDiv.textContent = '❌ AI model load failed. Check internet or reload.';
            console.error('Fallback model load failed:', err2);
            return;
        }
    }

    const isTelugu = (text) => /[\u0C00-\u0C7F]/.test(text);
    const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    clearBtn?.addEventListener('click', () => {
        queryInput.value = '';
        respDiv.textContent = '';
        respDiv.style.display = 'none';
        askBtn.disabled = false;
        askBtn.textContent = 'Ask AI';
    });

    askBtn.addEventListener('click', async () => {
        if (askBtn.disabled) return;

        const input = queryInput.value.trim();
        if (!input) {
            respDiv.style.display = 'block';
            respDiv.textContent = '⚠ Please enter a question.';
            return;
        }

        const usingTelugu = isTelugu(input);
        const prompt = `${usingTelugu
            ? "మీరు రామాయణం మరియు రామకోటి సంప్రదాయాల్లో నిపుణులైన ఆధ్యాత్మిక మార్గదర్శకులు. ప్రశ్న: "
            : "You are a spiritual expert on Ramayana and Rama Koti traditions. Question: "} ${input}\nAnswer:`;

        askBtn.disabled = true;
        const originalText = askBtn.textContent;
        askBtn.innerHTML = 'Loading… <span class="spinner"></span>';
        respDiv.style.display = 'block';
        respDiv.textContent = '⏳ Generating response...';

        try {
            const result = await generator(prompt, {
                max_length: 200,
                do_sample: true,
                temperature: 0.8,
                top_p: 0.95,
                timeout: 30000
            });

            let generated = result[0]?.generated_text || '';
            if (generated.startsWith(prompt)) {
                generated = generated.slice(prompt.length).trim();
            }

            const match = generated.match(/^([\s\S]*?)(?:\nQ:|$)/);
            if (match) generated = match[1].trim();

            const repeated = new RegExp(`^(?:${escapeRegExp(input)}\\s*)+$`, 'i');
            const badResp = !generated || generated.length < 50 || repeated.test(generated);

            const refusalKeywords = usingTelugu
                ? ["క్షమించండి", "సమాధానం ఇవ్వలేను", "వేరే ప్రశ్న"]
                : ["sorry", "decline", "cannot answer", "not about Ramayana"];

            const isRefusal = refusalKeywords.some(k => generated.toLowerCase().includes(k));

            if (isRefusal) {
                respDiv.textContent = usingTelugu
                    ? '🙏 దయచేసి రామాయణం లేదా రామకోటి గురించి మాత్రమే ప్రశ్న అడగండి.'
                    : '🙏 Please ask only about Ramayana or Rama Koti.';
            } else if (badResp) {
                respDiv.textContent = usingTelugu
                    ? '🙏 సమాధానం స్పష్టంగా లేదు. దయచేసి ప్రశ్నను మరల అడగండి.'
                    : '🙏 Response unclear. Please try asking again.';
            } else {
                respDiv.textContent = generated;
            }

        } catch (err) {
            console.error('Generation error:', err);
            respDiv.textContent = usingTelugu
                ? `❌ సమాధానం ఇవ్వడంలో లోపం: ${err.message}`
                : `❌ Error generating response: ${err.message}`;
        } finally {
            askBtn.disabled = false;
            askBtn.textContent = originalText;
        }
    });
})();

// Global error catch
window.addEventListener('error', e => console.error('Uncaught:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('Unhandled rejection:', e.reason || e.message));