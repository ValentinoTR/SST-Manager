import '../safety.js?v=20261107-operations';

const personnel = document.createElement('button');
personnel.type = 'button'; personnel.className = 'btn btn-light'; personnel.textContent = 'Personal registrado';
personnel.addEventListener('click', () => openOperationsPersonnel().catch(error => showToast(error.message)));
document.querySelector('#page-charlas .safety-actions').append(personnel);
const loginBrand = document.querySelector('.cloud-brand');
if (loginBrand) loginBrand.textContent = 'RELIPER / SEGURIDAD OPERACIONAL';
const loginDescription = document.querySelector('#cloudLogin > p');
if (loginDescription) loginDescription.textContent = 'Ingresa con tu cuenta para registrar vehículos, inspecciones y charlas en este espacio independiente.';
openPage(location.hash === '#charlas' ? 'charlas' : 'vehiculos');
window.SSTCloud.start();
