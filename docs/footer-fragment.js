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
          <input id="footer-feedback-email" name="email" type="email" autocomplete="email" maxlength="254" aria-describedby="footer-feedback-email-count" required />
          <p id="footer-feedback-email-count" class="field-count" aria-live="polite">0 / 254</p>

          <label for="footer-feedback-message">Message</label>
          <textarea id="footer-feedback-message" name="message" rows="3" minlength="10" maxlength="2000" aria-describedby="footer-feedback-message-count" required></textarea>
          <p id="footer-feedback-message-count" class="field-count" aria-live="polite">0 / 2000</p>

          <input type="text" name="_honey" tabindex="-1" autocomplete="off" class="hidden-honeypot" aria-hidden="true" />
          <input type="hidden" name="_captcha" value="true" />
          <input type="hidden" name="_subject" value="Navigate The Way website feedback" />
          <!-- FormSubmit rate limiting must be configured at the provider/account level. -->

          <button type="submit">Send Feedback</button>
          <p class="feedback-captcha-note">Spam protection may require a CAPTCHA check before your message is sent.</p>
          <p class="feedback-status" aria-live="polite"></p>
        </form>
        <div class="footer-legal">
          <p class="footer-copyright">© <a href="https://www.linkedin.com/company/shepherdpath-solutions/" target="_blank" rel="noreferrer">SheperdPath Solutions</a> <span id="current-year"></span></p>
          <p class="footer-social-links">
            <a href="https://www.facebook.com/profile.php?id=61566125041701" target="_blank" rel="noreferrer">Facebook</a>
            <span aria-hidden="true">•</span>
            <a href="https://www.linkedin.com/showcase/102618283" target="_blank" rel="noreferrer">LinkedIn</a>
            <span aria-hidden="true">•</span>
            <a href="/llms.txt">llms.txt</a>
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
    const emailField = form?.querySelector("#footer-feedback-email");
    const emailCount = form?.querySelector("#footer-feedback-email-count");
    const messageField = form?.querySelector("#footer-feedback-message");
    const messageCount = form?.querySelector("#footer-feedback-message-count");
    if (!form || !submitButton || !status) {
      return;
    }

    const updateCount = (field, countElement) => {
      if (!field || !countElement) {
        return;
      }

      const maxLength = Number(field.getAttribute("maxlength"));
      const currentLength = field.value.length;
      countElement.textContent = `${currentLength} / ${maxLength}`;
    };

    updateCount(emailField, emailCount);
    updateCount(messageField, messageCount);

    emailField?.addEventListener("input", () => {
      updateCount(emailField, emailCount);
    });

    messageField?.addEventListener("input", () => {
      updateCount(messageField, messageCount);
    });

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

        if (response.status === 422) {
          throw new Error("CAPTCHA challenge was not completed");
        }

        if (response.status === 429) {
          throw new Error("Rate limit reached");
        }

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
        updateCount(emailField, emailCount);
        updateCount(messageField, messageCount);
      } catch (error) {
        status.classList.add("feedback-error");
        if (error instanceof Error && error.message === "CAPTCHA challenge was not completed") {
          status.textContent = "Please complete the CAPTCHA challenge and submit again.";
        } else if (error instanceof Error && error.message === "Rate limit reached") {
          status.textContent = "You have submitted too many messages in a short time. Please wait a moment and try again.";
        } else {
          status.textContent = "Sorry, there was a problem sending your feedback. Please try again in a moment.";
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
