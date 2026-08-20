// ===============================
// ShortTrade
// wallet.js
// ===============================

const API_BASE =
    "https://short-term-sq5q.onrender.com/";


const connectButton =
    document.getElementById("connectWallet");

const walletAddress =
    document.getElementById("walletAddress");


async function connectWallet() {

    if (!window.ethereum) {

        alert(
            "Please open this website in a wallet-enabled browser."
        );

        return;

    }


    const userId =
        localStorage.getItem("shorttrade_user");


    if (!userId) {

        alert(
            "Please wait for User ID to load."
        );

        return;

    }


    try {

        const accounts =
            await window.ethereum.request({
                method: "eth_requestAccounts"
            });


        const address =
            accounts[0];


        const response =
            await fetch(
                `${API_BASE}/wallet/${encodeURIComponent(userId)}` +
                `?wallet_address=${encodeURIComponent(address)}`,
                {
                    method: "POST"
                }
            );


        const data =
            await response.json();


        if (!response.ok || data.error) {

            throw new Error(
                data.error || "Wallet connection failed"
            );

        }


        localStorage.setItem(
            "wallet",
            address
        );


        walletAddress.textContent =
            address;


        alert(
            "Wallet Connected Successfully"
        );


    } catch (error) {

        console.error(error);

        alert(
            "Wallet Connection Failed: " +
            error.message
        );

    }

}


function loadWallet() {

    const savedWallet =
        localStorage.getItem("wallet");


    if (savedWallet) {

        walletAddress.textContent =
            savedWallet;

    } else {

        walletAddress.textContent =
            "Not Connected";

    }

}


connectButton.addEventListener(
    "click",
    connectWallet
);


loadWallet();
