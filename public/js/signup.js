const togglePassword = (inputId, iconId) => {
  const input = document.querySelector(inputId);
  const icon = document.querySelector(iconId);

  icon.addEventListener("click", () => {
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";

    icon.classList.toggle("bi-eye", !isHidden);
    icon.classList.toggle("bi-eye-slash", isHidden);
  });
};

togglePassword("#pwd", "#eyeIcon1");
togglePassword("#confirmPwd", "#eyeIcon2");