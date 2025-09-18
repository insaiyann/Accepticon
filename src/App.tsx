import Layout from './components/Layout/Layout';
import InputPanel from './components/InputPanel/InputPanel';
import ViewerPanel from './components/ViewerPanel/ViewerPanel';
import { DiagramProvider } from './context/DiagramContext';
import { ViewerContentProvider } from './context/ViewerContentContext';
import './styles/App.css';

function App() {
  return (
    <DiagramProvider>
      <ViewerContentProvider>
        <Layout>
          <InputPanel />
          <ViewerPanel />
        </Layout>
      </ViewerContentProvider>
    </DiagramProvider>
  );
}

export default App;
