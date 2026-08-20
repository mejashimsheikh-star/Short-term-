// ===============================
// ShortTrade
// app.js
// ===============================

const API_BASE = "https://short-term-sq5q.onrender.com";

let userId = localStorage.getItem("shorttrade_user");


async function createUser() {

    try {

        const response = await fetch(
            `${API_BASE}/user`,
            {
                method: "POST"
            }
        );

        if (!response.ok) {
            throw new Error("User creation failed");
        }

        const data = await response.json();

        userId = data.user_id;

        localStorage.setItem(
            "shorttrade_user",
            userId
        );

        showUser();

    } catch (error) {

        console.error(error);

        document.getElementById("userId").textContent =
            "Unable to create user";

    }

}


function showUser() {

    const userElement =
        document.getElementById("userId");

    if (userElement) {

        userElement.textContent = userId;

    }

}


async function initializeUser() {

    if (!userId) {

        await createUser();

    } else {

        showUser();

    }

}


initializeUser();
