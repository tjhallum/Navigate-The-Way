(() => {
  const FOOTER_FORM_ENDPOINT = "https://formsubmit.co/navtheway@gmail.com";

  function buildFooter() {
    const footer = document.querySelector("footer[data-shared-footer]");
    if (!footer) {
      return;
    }

    footer.innerHTML = `
      <div class="footer-content">
        <form class="footer-feedback-form" method="POST" action="${FOOTER_FORM_ENDPOINT}" novalidate>
          <h2>Contact Us</h2>
          <label for="footer-feedback-email">Email</label>
          <input id="footer-feedback-email" name="email" type="email" autocomplete="email" required />

          <label for="footer-feedback-message">Message</label>
          <textarea id="footer-feedback-message" name="message" rows="3" required></textarea>

          <input type="text" name="_honey" tabindex="-1" autocomplete="off" class="hidden-honeypot" aria-hidden="true" />
          <input type="hidden" name="_captcha" value="true" />
          <input type="hidden" name="_subject" value="Navigate The Way website feedback" />

          <button type="submit">Send Feedback</button>
          <p class="feedback-privacy-notice">Feedback is used only to improve Navigate The Way and is retained in the designated feedback mailbox until reviewed and archived.</p>
          <p class="feedback-status" aria-live="polite"></p>
        </form>
        <div class="footer-legal">
          <p class="footer-copyright">© <a href="https://www.linkedin.com/company/shepherdpath-solutions/" target="_blank" rel="noreferrer">SheperdPath Solutions</a> <span id="current-year"></span></p>
        </div>
      </div>
    `;

    const year = footer.querySelector("#current-year");
    if (year) {
      year.textContent = String(new Date().getFullYear());
    }

    const form = footer.querySelector(".footer-feedback-form");
    const submitButton = form?.querySelector("button[type='submit']");
    const status = form?.querySelector(".feedback-status");
    if (!form || !submitButton || !status) {
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.className = "feedback-status";
      status.textContent = "";

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const formData = new FormData(form);
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";

      try {
        const response = await fetch(form.action, {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        status.classList.add("feedback-success");
        status.textContent = "Thank you! Your feedback was submitted successfully.";
        form.reset();
      } catch (error) {
        status.classList.add("feedback-error");
        status.textContent = "Sorry, there was a problem sending your feedback. Please try again in a moment.";
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Send Feedback";
      }
    });
  }

  buildFooter();
})();
