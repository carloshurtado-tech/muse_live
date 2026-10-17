// Presenter preview: the real glasses app mounted at its native 600×600, framed as a lens.
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import './styles.css';

createRoot(document.getElementById('glassesRoot')!).render(<Root />);
