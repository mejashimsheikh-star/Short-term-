// ===============================
// ShortTrade v1.0
// app.js (Final)
// ===============================

// Auto User ID

let userId = localStorage.getItem("shorttrade_user");

if (!userId) {

    userId = crypto.randomUUID();

    localStorage.setItem("shorttrade_user", userId);

}

// Show User ID

const userElement = document.getElementById("userId");

if (userElement) {

    userElement.textContent = userId;

}

// Portfolio

let portfolio = localStorage.getItem("portfolio");

if (!portfolio) {

    portfolio = 0;

    localStorage.setItem("portfolio", portfolio);

}

const portfolioElement = document.getElementById("portfolio");

if (portfolioElement) {

    portfolioElement.textContent = Number(portfolio).toFixed(2);

}

// Wallet

const walletElement = document.getElementById("walletAddress");

if (!localStorage.getItem("wallet")) {

    walletElement.textContent = "Not Connected";

} else {

    walletElement.textContent = localStorage.getItem("wallet");

}

// Save Portfolio

function savePortfolio(value) {

    localStorage.setItem("portfolio", value);

    portfolioElement.textContent = Number(value).toFixed(2);

}

// Export

window.shortTrade = {

    userId,

    savePortfolio

};
