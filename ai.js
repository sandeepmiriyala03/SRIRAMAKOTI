// Import pipeline from Xenova transformers CDN (stable correct URL)
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// --- UI Navigation (Assumes HTML with corresponding IDs) ---
/**
 * Shows a specific section of the page and hides all others.
 * @param {string} secId The ID of the section to show.
 */
function showSection(secId) {
    document.querySelectorAll('section').forEach(s => (s.style.display = 'none'));
    const active = document.getElementById(secId);
    if (active) active.style.display = 'block';
}

// Add event listeners for navigation buttons if they exist
document.getElementById('menuAbout')?.addEventListener('click', () => showSection('aboutPage'));
document.getElementById('menuInsert')?.addEventListener('click', () => showSection('insertPage'));
document.getElementById('menuTools')?.addEventListener('click', () => showSection('toolsPage'));

// --- Main AI Application Logic ---
(async () => {
    // Get references to all necessary UI elements
    const respDiv = document.getElementById('aiResponse');
    const askBtn = document.getElementById('askAIButton');
    const clearBtn = document.getElementById('clearAIButton');
    const queryInput = document.getElementById('aiQuery');

    // Add a new element for the loading progress
    const loadingProgressDiv = document.createElement('div');
    loadingProgressDiv.id = 'loadingProgress';
    loadingProgressDiv.style.display = 'none';
    respDiv.parentNode.insertBefore(loadingProgressDiv, respDiv.nextSibling);

    // **ERROR HANDLING 1:** Check for required DOM elements immediately.
    if (!respDiv || !askBtn || !queryInput) {
        const errorMessage = '❌ Fatal Error: Missing required DOM elements (aiResponse, askAIButton, or aiQuery). Please check your HTML file.';
        console.error(errorMessage);
        if (respDiv) {
            respDiv.style.display = 'block';
            respDiv.textContent = errorMessage;
        }
        return;
    }

    // Set initial loading state for the user
    respDiv.style.display = 'block';
    respDiv.textContent = '⏳ Loading AI model... (this may take a minute or two on the first run)';
    askBtn.disabled = true;

    let generator;
    try {
        // Allocate a pipeline for text generation.
        // The `progress_callback` function is new, and it updates the UI with the download status.
        generator = await pipeline('text-generation', 'Xenova/bloomz-560m', {
            progress_callback: (progress) => {
                if (progress.status === 'downloading') {
                    const percent = Math.round(progress.progress * 100);
                    respDiv.textContent = `⏳ Downloading AI model: ${percent}%`;
                }
            }
        });

        // Once the model is loaded, update the UI to indicate readiness.
        respDiv.textContent = '✅ AI is ready! Please ask your devotional question in English or Telugu.';
        askBtn.disabled = false;
    } catch (err) {
        // **ERROR HANDLING 2:** Catch and report model loading errors.
        respDiv.textContent = `❌ Failed to load AI model. Details: ${err.message}. Please reload the page and try again.`;
        console.error('Model loading error:', err);
        askBtn.disabled = true;
        return;
    }

    /**
     * Checks if the input text contains Telugu characters.
     * @param {string} text The text to check.
     * @returns {boolean} True if the text contains Telugu characters, otherwise false.
     */
    function isTelugu(text) {
        return /[\u0C00-\u0C7F]/.test(text);
    }

    /**
     * Escapes special regex characters in a string.
     * @param {string} text The text to escape.
     * @returns {string} The escaped string.
     */
    function escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Clear button resets the input field and hides the response.
    clearBtn.addEventListener('click', () => {
        queryInput.value = '';
        respDiv.style.display = 'none';
        respDiv.textContent = '';
        askBtn.disabled = false;
        askBtn.textContent = 'Ask AI';
        queryInput.focus();
    });

    // Ask button triggers the AI text generation.
    askBtn.addEventListener('click', async () => {
        // Prevent multiple clicks while processing.
        if (askBtn.disabled) return;

        let userInput = queryInput.value.trim();

        // Validate user input.
        if (!userInput) {
            respDiv.style.display = 'block';
            respDiv.textContent = '⚠ Please enter a question.';
            return;
        }

        const usingTelugu = isTelugu(userInput);

        const promptPrefixEnglish =
            "You are a knowledgeable, respectful, and compassionate spiritual guide on the Hindu epic Ramayana and the sacred traditions of Rama Koti. " +
            "Your answers must be: devotional, informative, and strictly based on the Ramayana. " +
            "Provide concise answers in 2-3 paragraphs. If the question is not about the Ramayana or Rama Koti, you must politely decline to answer. " +
            "Never generate generic or unrelated content. Your tone should be gentle and reverent. The question is as follows:\n\n";

        const promptPrefixTelugu =
            "మీరు రామాయణం మరియు రామ కోటి సంప్రదాయాలలో జ్ఞానవంతమైన, గౌరవనీయమైన మరియు దయగల ఆధ్యాత్మిక మార్గదర్శకులు. " +
            "మీ సమాధానాలు భక్తిపూర్వకంగా, సమాచారంతో కూడినవిగా మరియు రామాయణాన్ని మాత్రమే ఆధారంగా చేసుకొని ఉండాలి. " +
            "సంక్షిప్తంగా, 2-3 పేరాలలో సమాధానం ఇవ్వండి. ప్రశ్న రామాయణం లేదా రామ కోటి గురించి కాకపోతే, దయతో సమాధానం ఇవ్వడం నిరాకరించండి. " +
            "సాధారణ లేదా సంబంధం లేని విషయాలను ఎప్పుడూ చెప్పవద్దు. మీ శైలి సున్నితంగా మరియు గౌరవంగా ఉండాలి. ప్రశ్న ఈ క్రింది విధంగా ఉంది:\n\n";

        const finalPrompt = `${usingTelugu ? promptPrefixTelugu : promptPrefixEnglish}Q: ${userInput}\nA:`;

        // Update UI to show that the AI is processing.
        askBtn.disabled = true;
        const originalBtnText = askBtn.textContent;
        askBtn.innerHTML = 'Loading… <span class="spinner" aria-hidden="true"></span>';
        respDiv.style.display = 'block';
        respDiv.textContent = '⏳ Generating response...';

        try {
            console.log('Prompt sent:', finalPrompt);

            // --- Refined Generation Parameters and Timeout ---
            const results = await generator(finalPrompt, {
                max_length: 200,
                do_sample: true,
                temperature: 0.8,
                top_p: 0.95,
                timeout: 30000
            });

            console.log('AI response:', results[0].generated_text);

            let generatedText = results[0].generated_text;

            // Clean up the generated text.
            if (generatedText.startsWith(finalPrompt)) {
                generatedText = generatedText.slice(finalPrompt.length).trim();
            }

            const answerMatch = generatedText.match(/^([\s\S]*?)(?:\nQ:|$)/);
            if (answerMatch) {
                generatedText = answerMatch[1].trim();
            }

            // **ERROR HANDLING 4:** Improved fallback logic for bad answers.
            const repeatedPattern = new RegExp(`^(?:${escapeRegExp(userInput)}\\s*)+$`, 'i');
            const refusalKeywordsEnglish = ["sorry", "apologies", "decline to answer", "cannot answer", "not about Ramayana"];
            const refusalKeywordsTelugu = ["క్షమించండి", "సమాధానం ఇవ్వలేను", "దయచేసి వేరే ప్రశ్న అడగండి", "రామాయణం గురించి కాదు"];
            const refusalKeywords = usingTelugu ? refusalKeywordsTelugu : refusalKeywordsEnglish;

            const isBadResponse = !generatedText ||
                                  generatedText.length < 50 ||
                                  repeatedPattern.test(generatedText) ||
                                  generatedText.toLowerCase().includes(userInput.toLowerCase().repeat(2));

            // Check if the response is a refusal, and if so, give a helpful message.
            if (refusalKeywords.some(keyword => generatedText.toLowerCase().includes(keyword))) {
                 respDiv.textContent = usingTelugu
                    ? '🙏 దయచేసి రామాయణం లేదా రామ కోటి సంప్రదాయాల గురించి మాత్రమే ప్రశ్న అడగండి.'
                    : "🙏 Please ask a question specifically about the Ramayana or Rama Koti traditions.";
            } else if (isBadResponse) {
                // If it's a generally bad response, use the generic fallback.
                respDiv.textContent = usingTelugu
                    ? '🙏 మీరు అడిగిన ప్రశ్నకు సరైన సమాధానం ఇవ్వలేకపోతున్నాను. దయచేసి వేరే విధంగా అడగండి.'
                    : "🙏 Sorry, I couldn't generate a meaningful devotional response. Please try rephrasing your question.";
            } else {
                // Otherwise, the response is good to go.
                respDiv.textContent = generatedText;
            }

        } catch (error) {
            // **ERROR HANDLING 5:** Catch and report any runtime errors during text generation.
            console.error('Error generating AI response:', error);
            respDiv.textContent = usingTelugu
                ? '❌ సమాధానం ఇవ్వడంలో లోపం. దయచేసి తర్వాత ప్రయత్నించండి. సాంకేతిక లోపం: ' + error.message
                : '❌ Error generating response. Please try again later. Technical Error: ' + error.message;
        } finally {
            // Always restore the button state and text after processing is complete.
            askBtn.disabled = false;
            askBtn.innerHTML = originalBtnText;
            respDiv.style.display = 'block';
        }
    });
})();

// **ERROR HANDLING 6:** Global error handlers to catch unexpected issues.
window.addEventListener('error', e => console.error('Uncaught error:', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('Unhandled promise rejection:', e.reason || e.message));
