// Import pipeline from Xenova transformers via versioned CDN URL
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Helper function to show only the selected section and hide others
function showSection(secId) {
  document.querySelectorAll('section').forEach(s => (s.style.display = 'none'));
  const active = document.getElementById(secId);
  if (active) active.style.display = 'block';
}

// Bind navigation buttons
document.getElementById('menuAbout').onclick = () => showSection('aboutPage');
document.getElementById('menuInsert').onclick = () => showSection('insertPage');
document.getElementById('menuTools').onclick = () => showSection('toolsPage');


(async () => {
  const respDiv = document.getElementById('aiResponse');
  respDiv.style.display = 'none';
  respDiv.textContent = "⏳ Loading AI model... Please wait (first load ~20–30 seconds)";

  try {
    const generator = await pipeline('text-generation', 'Xenova/distilgpt2');

    respDiv.style.display = 'block';
    respDiv.textContent = "✅ AI is ready — ask your devotional question below.";

    const askButton = document.getElementById('askAIButton');
    const clearButton = document.getElementById('clearAIButton');

    // Clear button to reset input and output
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        document.getElementById('aiQuery').value = '';
        respDiv.textContent = '';
        respDiv.style.display = 'none';
        if (askButton.disabled) {
          askButton.disabled = false;
          askButton.innerHTML = 'Ask AI';
        }
      });
    }

    askButton.addEventListener('click', async () => {
      if (askButton.disabled) return; // prevent multiple clicks

      const userInput = document.getElementById('aiQuery').value.trim();

      if (!userInput) {
        respDiv.style.display = 'block';
        respDiv.textContent = "⚠ Please enter a question.";
        return;
      }

      // Disable button immediately upon click
      askButton.disabled = true;
      const originalBtnText = askButton.textContent;
      askButton.innerHTML = 'Loading… <span class="spinner" aria-hidden="true">⏳</span>';

      // Clear and hide previous response
      respDiv.style.display = 'none';
      respDiv.textContent = '';

      // Well-crafted devotional prompt that encourages relevant and accurate answers
      const promptPrefix =
        "You are a knowledgeable and respectful devotional spiritual guide, specialized in Hindu dharma, Lord Rama, Ramayana, and the spiritual practice of Rama Koti. " +
        "Answer concisely, clearly, and accurately in a devotional style.\n\nQ: ";
      const promptSuffix = "\nA:";
      const finalPrompt = promptPrefix + userInput + promptSuffix;

      try {
        // Show "Thinking" status
        respDiv.textContent = "🤔 Thinking...";
        respDiv.style.display = 'block';

        // Generate the answer with tuned parameters
        const results = await generator(finalPrompt, {
          max_length: 160,
          do_sample: true,
          temperature: 0.7,
          top_p: 0.9,
          top_k: 50,
        });

        let generatedText = results[0].generated_text;

        // Remove the echoed prompt prefix if present in the output
        if (generatedText.startsWith(finalPrompt)) {
          generatedText = generatedText.slice(finalPrompt.length).trim();
        }

        // Detect if the output is just repeated questions or prompt and fallback politely
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
        // Reset button state
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

// Utility function to escape special regex characters safely
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
