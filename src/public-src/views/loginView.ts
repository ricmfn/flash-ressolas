import { api } from "../api/client.js";
import { el, clear } from "../ui/dom.js";

interface LoginViewOptions {
  onLoggedIn: (username: string) => void;
}

export function renderLoginView(container: Element, options: LoginViewOptions): void {
  let submitting = false;
  let error: string | null = null;

  function render(): void {
    clear(container);

    const usernameInput = el("input", {
      type: "text",
      name: "username",
      class: "login-form__input",
      placeholder: "Usuário",
      autocomplete: "username",
      required: true,
    }) as HTMLInputElement;

    const passwordInput = el("input", {
      type: "password",
      name: "password",
      class: "login-form__input",
      placeholder: "Senha",
      autocomplete: "current-password",
      required: true,
    }) as HTMLInputElement;

    const form = el(
      "form",
      {
        class: "login-form",
        onsubmit: async (ev) => {
          ev.preventDefault();
          if (submitting) return;
          submitting = true;
          error = null;
          render();
          const result = await api.login(usernameInput.value.trim(), passwordInput.value);
          submitting = false;
          if (result.ok) {
            options.onLoggedIn(result.data.username);
          } else {
            error = result.error;
            render();
          }
        },
      },
      [
        el("div", { class: "brand-mark" }, [
          el("span", { class: "brand-mark__flash" }, ["FL⚡SH"]),
          el("span", { class: "brand-mark__vertical" }, ["ressolas"]),
        ]),
        el("h1", { class: "login-form__title" }, ["Entrar"]),
        usernameInput,
        passwordInput,
        error ? el("p", { class: "login-form__error" }, [error]) : null,
        el("button", { type: "submit", class: "btn btn--primary btn--block", disabled: submitting }, [
          submitting ? "Entrando…" : "Entrar",
        ]),
      ],
    );

    container.appendChild(el("div", { class: "login-screen" }, [form]));
  }

  render();
}
