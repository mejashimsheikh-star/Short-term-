// ===============================
// ShortTrade
// market.js
// ===============================

const marketContainer =
    document.getElementById("marketContainer");


const API_BASE =
    "https://short-term-sq5q.onrender.com/";


async function loadMarket() {

    try {

        const response = await fetch(
            `${API_BASE}/market`
        );

        if (!response.ok) {
            throw new Error("Market request failed");
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        marketContainer.innerHTML = "";

        for (const coin in data) {

            const price = data[coin].usd;

            const change =
                data[coin].usd_24h_change ?? 0;


            const card =
                document.createElement("div");

            card.className = "coin-card";


            card.innerHTML = `
                <h3>${coin.toUpperCase()}</h3>

                <h2>
                    $${Number(price).toLocaleString()}
                </h2>

                <p class="${change >= 0 ? "green" : "red"}">
                    ${Number(change).toFixed(2)}%
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

setInterval(
    loadMarket,
    10000
);
