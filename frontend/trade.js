// ===============================
// ShortTrade
// trade.js
// ===============================

const API_BASE =
    "https://short-term-sq5q.onrender.com";


const buyButton =
    document.getElementById("buyButton");

const sellButton =
    document.getElementById("sellButton");

const coinSelect =
    document.getElementById("coin");

const amountInput =
    document.getElementById("amount");

const historyBox =
    document.getElementById("history");


async function saveTrade(type) {

    const userId =
        localStorage.getItem("shorttrade_user");

    const coin =
        coinSelect.value;

    const amount =
        Number(amountInput.value);


    if (!userId) {

        alert("User is not ready yet.");

        return;

    }


    if (!amount || amount <= 0) {

        alert("Enter a valid amount");

        return;

    }


    try {

        const marketResponse =
            await fetch(
                `${API_BASE}/market`
            );


        const market =
            await marketResponse.json();


        const price =
            market[coin]?.usd;


        if (!price) {

            alert("Unable to get coin price");

            return;

        }


        const url =
            `${API_BASE}/trade` +
            `?user_id=${encodeURIComponent(userId)}` +
            `&coin=${encodeURIComponent(coin)}` +
            `&trade_type=${encodeURIComponent(type)}` +
            `&amount=${encodeURIComponent(amount)}` +
            `&price=${encodeURIComponent(price)}`;


        const response =
            await fetch(
                url,
                {
                    method: "POST"
                }
            );


        const data =
            await response.json();


        if (!response.ok || data.error) {

            throw new Error(
                data.error || "Trade failed"
            );

        }


        amountInput.value = "";

        await loadHistory();

        alert("Trade saved successfully.");

    } catch (error) {

        console.error(error);

        alert(
            "Trade failed: " +
            error.message
        );

    }

}


async function loadHistory() {

    const userId =
        localStorage.getItem("shorttrade_user");


    if (!userId) {

        historyBox.innerHTML =
            "User not ready.";

        return;

    }


    try {

        const response =
            await fetch(
                `${API_BASE}/trades/${encodeURIComponent(userId)}`
            );


        const trades =
            await response.json();


        if (!trades.length) {

            historyBox.innerHTML =
                "No Trades";

            return;

        }


        historyBox.innerHTML = "";


        trades.forEach(
            (trade) => {

                const item =
                    document.createElement("div");

                item.className =
                    "trade-item";


                item.innerHTML = `
                    <strong>
                        ${trade.trade_type}
                    </strong>
                    <br>
                    Coin: ${trade.coin}
                    <br>
                    Amount: ${trade.amount}
                    <br>
                    Price: $${trade.price}
                    <br>
                    Total: $${trade.total}
                    <br>
                    Time: ${new Date(
                        trade.created_at
                    ).toLocaleString()}
                `;


                historyBox.appendChild(item);

            }
        );

    } catch (error) {

        console.error(error);

        historyBox.innerHTML =
            "Unable to load trade history.";

    }

}


buyButton.addEventListener(
    "click",
    () => saveTrade("BUY")
);


sellButton.addEventListener(
    "click",
    () => saveTrade("SELL")
);


loadHistory();
