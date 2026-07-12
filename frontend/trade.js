// ===============================
// ShortTrade v1.0
// trade.js
// ===============================

const buyButton = document.getElementById("buyButton");
const sellButton = document.getElementById("sellButton");
const coinSelect = document.getElementById("coin");
const amountInput = document.getElementById("amount");
const historyBox = document.getElementById("history");

let trades = JSON.parse(localStorage.getItem("trades")) || [];

function renderHistory() {

    if (trades.length === 0) {

        historyBox.innerHTML = "No Trades";

        return;

    }

    historyBox.innerHTML = "";

    trades.slice().reverse().forEach((trade) => {

        const item = document.createElement("div");

        item.className = "trade-item";

        item.innerHTML = `
            <strong>${trade.type}</strong><br>
            Coin: ${trade.coin}<br>
            Amount: ${trade.amount}<br>
            Time: ${trade.time}
        `;

        historyBox.appendChild(item);

    });

}

function saveTrade(type) {

    const coin = coinSelect.value;
    const amount = amountInput.value;

    if (!amount || Number(amount) <= 0) {

        alert("Enter a valid amount");

        return;

    }

    trades.push({

        type,
        coin,
        amount,
        time: new Date().toLocaleString()

    });

    localStorage.setItem(
        "trades",
        JSON.stringify(trades)
    );

    renderHistory();

    amountInput.value = "";

}

buyButton.addEventListener("click", () => {

    saveTrade("BUY");

});

sellButton.addEventListener("click", () => {

    saveTrade("SELL");

});

renderHistory();
