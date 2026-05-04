const btn = document.getElementById("populateBtn");
const status = document.getElementById("status");

btn.addEventListener("click", async () => {
  status.textContent = "Populating database...";
  status.className = "";

  try {
    const res = await fetch("/populate-db", {
      method: "POST"
    });
    const data = await res.json();
    if (data.success) {
      status.textContent = data.message;
      status.className = "success";
      btn.disabled = true;
    } else {
      status.textContent = data.message;
      status.className = "error";
    }
  } catch (err) {
    status.textContent = "Error running populate script.";
    status.className = "error";
  }
});