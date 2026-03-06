import { render } from 'solid-js/web';
import App from './App';
import './styles.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

render(() => <App />, document.getElementById('root')!);
