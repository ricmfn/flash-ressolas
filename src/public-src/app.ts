import { api } from "./api/client.js";
import { el, clear } from "./ui/dom.js";
import { renderLoginView } from "./views/loginView.js";
import { renderOrdersView } from "./views/ordersView.js";
import { renderDashboardView } from "./views/dashboardView.js";

type View = "orders" | "dashboard";

/** UNICO timer de auto-refresh do lado do cliente (complementa o auto-sync do servidor,
 * que roda no backend independentemente da tela estar aberta). */
const CLIENT_REFRESH_INTERVAL_MS = 60_000;
let clientRefreshTimer: ReturnType<typeof setInterval> | null = null;

function startApp(): void {
  const appRootEl = document.getElementById("app");
  if (!appRootEl) return;
  const appRoot: HTMLElement = appRootEl;

  let currentView: View = "orders";
  let username: string | null = null;
  let ordersHandle: ReturnType<typeof renderOrdersView> | null = null;
  let dashboardHandle: ReturnType<typeof renderDashboardView> | null = null;

  function stopClientRefresh(): void {
    if (clientRefreshTimer !== null) {
      clearInterval(clientRefreshTimer);
      clientRefreshTimer = null;
    }
  }

  function startClientRefresh(): void {
    stopClientRefresh(); // garante um UNICO timer ativo por vez
    clientRefreshTimer = setInterval(() => {
      if (currentView === "orders") void ordersHandle?.refresh(false);
      else void dashboardHandle?.refresh();
    }, CLIENT_REFRESH_INTERVAL_MS);
  }

  function renderShell(): void {
    clear(appRoot);

    const header = el("header", { class: "app-header" }, [
      el("div", { class: "brand-mark brand-mark--small" }, [
        el("span", { class: "brand-mark__flash" }, ["FL⚡SH"]),
        el("span", { class: "brand-mark__vertical" }, ["ressolas"]),
      ]),
      el("nav", { class: "app-nav" }, [
        navButton("orders", "Pedidos"),
        navButton("dashboard", "Dashboard"),
      ]),
      el(
        "button",
        {
          class: "btn btn--ghost",
          onclick: async () => {
            await api.logout();
            stopClientRefresh();
            username = null;
            renderShell();
          },
        },
        ["Sair"],
      ),
    ]);

    const main = el("main", { class: "app-main" });

    appRoot.appendChild(header);
    appRoot.appendChild(main);

    if (currentView === "orders") {
      ordersHandle = renderOrdersView(main);
      dashboardHandle = null;
    } else {
      dashboardHandle = renderDashboardView(main);
      ordersHandle = null;
    }
  }

  function navButton(view: View, label: string): HTMLElement {
    return el(
      "button",
      {
        class: `app-nav__btn${currentView === view ? " app-nav__btn--active" : ""}`,
        onclick: () => {
          if (currentView === view) return;
          currentView = view;
          renderShell();
        },
      },
      [label],
    );
  }

  function showLoggedOut(): void {
    stopClientRefresh();
    renderLoginView(appRoot, {
      onLoggedIn: (user) => {
        username = user;
        currentView = "orders";
        renderShell();
        startClientRefresh();
      },
    });
  }

  // Sessao persistente: ao carregar, tenta reaproveitar o cookie de sessao existente.
  // Em qualquer falha (rede, 401, etc.) cai graciosamente na tela de login — nunca
  // fica com tela preta.
  api
    .me()
    .then((result) => {
      if (result.ok) {
        username = result.data.username;
        renderShell();
        startClientRefresh();
      } else {
        showLoggedOut();
      }
    })
    .catch(() => showLoggedOut());
}

document.addEventListener("DOMContentLoaded", startApp);

// Registra o service worker apenas para o "app shell" estatico — nunca intercepta /api/.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Falha ao registrar o SW nao deve impedir o app de funcionar normalmente.
    });
  });
}
