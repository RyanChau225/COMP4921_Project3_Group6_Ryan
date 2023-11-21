

document.addEventListener('DOMContentLoaded', function () {
  var errorElement = document.getElementById('error-data');
  if (errorElement) {  // Check if errorElement is not null
      var error = errorElement.getAttribute('data-error');
      if (error) {
          var errorModal = document.getElementById('errorModal');
          errorModal.classList.add('is-active');

          var modalContent = errorModal.querySelector('.modal-card-body');
          modalContent.textContent = error;
      }
  } else {
      console.error('Error element not found');
  }
});
