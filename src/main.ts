import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// Apply the last theme immediately so the window never flashes the wrong colours.
const theme = localStorage.getItem('fr-theme');
if (theme) document.documentElement.dataset.theme = theme;

export default mount(App, { target: document.getElementById('app')!, intro: true });
