// ===============================
// ShortTrade v1.0
// wallet.js
// ===============================

const connectButton = document.getElementById("connectWallet");
const walletAddress = document.getElementById("walletAddress");

async function connectWallet() {

    if (!window.ethereum) {
        alert("Please open this website inside Coinbase Wallet Browser.");
        return;
    }

    try {

        const accounts = await window.ethereum.request({
            method: "eth_requestAccounts"
        });

        const address = accounts[0];

        localStorage.setItem("wallet", address);

        walletAddress.textContent = address;

        alert("Wallet Connected Successfully");

    } catch (error) {

        console.error(error);

        alert("Wallet Connection Failed");

    }

}

connectButton.addEventListener("click", connectWallet);
