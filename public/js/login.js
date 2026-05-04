const eyeIcon = document.querySelector("#eyeIcon");;
eyeIcon.addEventListener("click", () => {
    const isHidden = pwd.type === "password";
    pwd.type = (isHidden) ? "text" : "password";
    eyeIcon.classList.toggle("bi-eye", !isHidden);
    eyeIcon.classList.toggle("bi-eye-slash", isHidden);
});