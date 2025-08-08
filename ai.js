// Import pipeline from Xenova transformers via versioned CDN URL
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Optional: Helper function to control app sections, remove if not needed
function showSection(secId) {
  document.querySelectorAll('section').forEach(s => (s.style.display = 'none'));
  const active = document.getElementById(secId);
  if (active) active.style.display = 'block';
}

// Bind navigation buttons if your app uses sections (optional)
document.getElementById('menuAbout')?.addEventListener('click', () => showSection('aboutPage'));
document.getElementById('menuInsert')?.addEventListener('click', () => showSection('insertPage'));
document.getElementById('menuTools')?.addEventListener('click', () => showSection('toolsPage'));

(async () => {
  const respDiv = document.getElementById('aiResponse');
  respDiv.style.display = 'none';
  respDiv.textContent = "⏳ Loading AI model... Please wait (first load ~20–30 seconds)";

  try {
    // Load the DistilGPT-2 text generation pipeline
    const generator = await pipeline('text-generation', 'Xenova/distilgpt2');

    respDiv.style.display = 'block';
    respDiv.textContent = "✅ AI is ready — ask your devotional question below.";

    const askButton = document.getElementById('askAIButton');
    const clearButton = document.getElementById('clearAIButton');

    // Clear button resets input and output
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        const queryInput = document.getElementById('aiQuery');
        queryInput.value = '';
        respDiv.style.display = 'none';
        respDiv.textContent = '';
        if (askButton.disabled) {
          askButton.disabled = false;
          askButton.textContent = 'Ask AI';
        }
        queryInput.focus();
      });
    }

    askButton.addEventListener('click', async () => {
      if (askButton.disabled) return; // Prevent repeated clicks

      const userInput = document.getElementById('aiQuery').value.trim();

      if (!userInput) {
        respDiv.style.display = 'block';
        respDiv.textContent = "⚠ Please enter a question.";
        return;
      }

      // Disable the ask button and show loading spinner
      askButton.disabled = true;
      const originalBtnText = askButton.textContent;
      askButton.innerHTML = 'Loading… <span class="spinner" aria-hidden="true">⏳</span>';

      // Clear prior AI response
      respDiv.style.display = 'none';
      respDiv.textContent = '';

      // Prompt focusing strictly on Ramayana and all core characters,
      // instructing clear, devotional, concise answers (~4-5 lines),
      // including key characters and shlokas if relevant.
      const promptPrefix =
        "You are a knowledgeable and respectful spiritual guide focused exclusively on the Ramayana (Ramayannamu), " +
        "Lord Rama, and Rama Koti devotional teachings. " +
        "Provide clear, devotional, and concise answers in about 4-5 lines. " +
        "Include descriptions and spiritual significance of all major Ramayana characters such as Rama, Sita, Lakshmana, Hanuman, Ravana, Dasaratha, Valmiki, and others when relevant. " +
        "Include famous shlokas only if directly applicable. " +
        "Always maintain reverence and avoid unrelated topics.\n\nQ: ";

      const promptSuffix = "\nA:";
      const finalPrompt = promptPrefix + userInput + promptSuffix;

      try {
        respDiv.textContent = "🤔 Thinking...";
        respDiv.style.display = 'block';

        const results = await generator(finalPrompt, {
          max_length: 150,      // keeps answers concise (~4-5 lines)
          do_sample: true,
          temperature: 0.65,    // focus on relevance, less randomness
          top_p: 0.85,
          top_k: 40,
        });

        let generatedText = results[0].generated_text;

        // Remove echoed prompt if present
        if (generatedText.startsWith(finalPrompt)) {
          generatedText = generatedText.slice(finalPrompt.length).trim();
        }

        // Detect repeated or irrelevant output and provide fallback message
        const repeatPattern = new RegExp(`^(Q: ${escapeRegExp(userInput)}\\s*)+$`, 'i');
        if (
          !generatedText ||
          repeatPattern.test(generatedText) ||
          generatedText.toLowerCase().includes(userInput.toLowerCase().repeat(3))
        ) {
          generatedText = "🙏 Sorry, I couldn't generate a meaningful devotional response at this time. Please try rephrasing your question.";
        }

        respDiv.textContent = generatedText;
      } catch (error) {
        console.error("Error generating AI response:", error);
        respDiv.textContent = "❌ Error generating response. Please try again later.";
      } finally {
        // Restore ask button state
        askButton.innerHTML = originalBtnText;
        askButton.disabled = false;
        respDiv.style.display = 'block';
      }
    });
  } catch (error) {
    console.error("Error loading AI model:", error);
    if (error.message && error.message.includes('404')) {
      respDiv.textContent = "❌ AI model resources not found (404). Please check model availability or CDN.";
    } else {
      respDiv.textContent = "❌ Failed to load AI model. Please refresh the page and try again.";
    }
    respDiv.style.display = 'block';
  }
})();

// Utility function to safely escape regex special characters for repeated pattern matching
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
