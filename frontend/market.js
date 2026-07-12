// ===============================
// ShortTrade v1.0
// market.js
// ===============================

const marketContainer = document.getElementById("marketContainer");

const API = "http://127.0.0.1:8000/market";
// পরে Render-এ Deploy করলে এই URL পরিবর্তন করে
// আপনার Backend URL বসাব।

async function loadMarket() {

    try {

        const response = await fetch(API);

        const data = await response.json();

        marketContainer.innerHTML = "";

        for (const coin in data) {

            const price = data[coin].usd;

            const change = data[coin].usd_24h_change;

            const card = document.createElement("div");

            card.className = "coin-card";

            card.innerHTML = `
                <h3>${coin.toUpperCase()}</h3>
                <h2>$${price}</h2>
                <p class="${change >= 0 ? "green" : "red"}">
                    ${change.toFixed(2)}%
                </p>
            `;

            marketContainer.appendChild(card);

        }

    } catch (error) {

        console.error(error);

        marketContainer.innerHTML =
            "<p>Market data unavailable.</p>";

    }

}

loadMarket();

setInterval(loadMarket, 10000);
