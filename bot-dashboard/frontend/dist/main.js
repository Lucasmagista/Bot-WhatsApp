function iniciarBotDashboard() {
    if (typeof console !== "undefined" && typeof console.info === "function") {
        console.info("Bot Dashboard iniciado!");
    } else {
        alert("Erro: Console não disponível.");
    }
}

iniciarBotDashboard();