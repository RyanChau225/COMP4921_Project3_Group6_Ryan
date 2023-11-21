

document.addEventListener("mousemove", function(e) {
  const header = document.querySelector(".navbar");
  // If the mouse is within 50 pixels from the top of the viewport, show the header
  if (e.clientY <= 50) {
      header.style.opacity = "1";
  } else {
      header.style.opacity = "0";
  }
});






