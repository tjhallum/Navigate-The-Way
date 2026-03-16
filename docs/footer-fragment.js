(() => {
  const FOOTER_FORM_ENDPOINT = "https://formsubmit.co/ajax/4113a97af286d9c7a1a1f79c97ddf8f7";
  const FOOTER_FORM_TIMEOUT_MS = 12000;

  function trackFooterFeedbackFailure(failureType) {
    if (typeof gtag !== "function") {
      return;
    }

    gtag("event", "footer_feedback_submit_failed", {
      event_category: "footer_feedback_form",
      failure_type: failureType,
    });
  }

  function buildFooter() {
    const footer = document.querySelector("footer[data-shared-footer]");
    if (!footer) {
      return;
    }

    footer.innerHTML = `
      <div class="footer-content">
        <form id="footer-feedback-form" name="footer_feedback_form" class="footer-feedback-form" method="POST" action="${FOOTER_FORM_ENDPOINT}" novalidate>
          <h2>Contact Us</h2>
          <label for="footer-feedback-email">Email</label>
          <input id="footer-feedback-email" name="email" type="email" autocomplete="email" required />

          <label for="footer-feedback-message">Message</label>
          <textarea id="footer-feedback-message" name="message" rows="3" required></textarea>

          <input type="text" name="_honey" tabindex="-1" autocomplete="off" class="hidden-honeypot" aria-hidden="true" />
          <input type="hidden" name="_captcha" value="false" />
          <input type="hidden" name="_subject" value="Navigate The Way website feedback" />

          <button type="submit">Send Feedback</button>
          <p class="feedback-status" aria-live="polite"></p>
        </form>
        <div class="footer-legal">
          <p class="footer-copyright">© <a href="https://www.linkedin.com/company/shepherdpath-solutions/" target="_blank" rel="noreferrer">SheperdPath Solutions</a> <span id="current-year"></span></p>
          <p class="footer-social-links">
            <a href="https://www.facebook.com/profile.php?id=61566125041701" target="_blank" rel="noreferrer">Facebook</a>
            <span aria-hidden="true">•</span>
            <a href="https://www.linkedin.com/showcase/102618283" target="_blank" rel="noreferrer">LinkedIn</a>
          </p>
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
        status.classList.add("feedback-error");
        status.textContent = "Please complete all required fields before submitting.";
        trackFooterFeedbackFailure("validation_failed");
        form.reportValidity();
        return;
      }

      const formData = new FormData(form);
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        controller.abort("timeout");
      }, FOOTER_FORM_TIMEOUT_MS);

      try {
        const response = await fetch(form.action, {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const payload = await response.json().catch(() => null);
        const acknowledgedSuccess = payload?.success === true || payload?.success === "true";
        if (!acknowledgedSuccess) {
          throw new Error("FormSubmit did not acknowledge success");
        }

        status.classList.add("feedback-success");
        status.textContent = "Thank you! Your feedback was submitted successfully.";
        if (typeof gtag === "function") {
          gtag("event", "generate_lead", {
            lead_source: "footer_feedback_form"
          });
        }
        form.reset();
      } catch (error) {
        status.classList.add("feedback-error");

        if (error?.name === "AbortError") {
          status.textContent = "The request timed out. Please try again.";
          trackFooterFeedbackFailure("timeout");
        } else {
          status.textContent = "Sorry, we could not send your feedback due to a server issue. Please try again shortly.";
          trackFooterFeedbackFailure("server_failure");
        }
      } finally {
        window.clearTimeout(timeoutId);
        submitButton.disabled = false;
        submitButton.textContent = "Send Feedback";
      }
    });
  }

  buildFooter();
})();
