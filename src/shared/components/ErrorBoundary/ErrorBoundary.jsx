import React from 'react';

// Mostra o erro na tela em vez de deixar a interface em branco.
// `compacto` = faixa pequena (para a barra de controle); sem ele ocupa a tela toda.
export default class ErrorBoundary extends React.Component {
  state = { erro: null, pilha: '' };

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error('Erro na interface:', erro, info?.componentStack);
    this.setState({ pilha: info?.componentStack ?? '' });
  }

  limpar = () => this.setState({ erro: null, pilha: '' });

  copiar = () => {
    const { erro, pilha } = this.state;
    navigator.clipboard?.writeText(`${erro?.message}\n${erro?.stack ?? ''}\n${pilha}`).catch(() => {});
  };

  render() {
    const { erro, pilha } = this.state;
    if (!erro) return this.props.children;

    const botao = {
      marginLeft: 8, padding: '2px 8px', border: '1px solid #f85149',
      borderRadius: 4, background: 'transparent', color: 'inherit', cursor: 'pointer',
    };

    if (this.props.compacto) {
      return (
        <div style={{ padding: '4px 8px', background: '#3a1518', color: '#ffb4ae', fontSize: 12, flexShrink: 0 }}>
          ⚠ {String(erro.message)}
          <button style={botao} onClick={this.limpar}>Tentar de novo</button>
          <button style={botao} onClick={this.copiar}>Copiar</button>
        </div>
      );
    }

    return (
      <div style={{ padding: 16, height: '100vh', boxSizing: 'border-box', overflow: 'auto', background: '#14161f', color: '#e6e8ef' }}>
        <h2 style={{ marginTop: 0 }}>Algo deu errado</h2>
        <p style={{ color: '#ffb4ae' }}>{String(erro.message)}</p>
        <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', opacity: 0.8 }}>{pilha}</pre>
        <button style={botao} onClick={this.limpar}>Tentar de novo</button>
        <button style={botao} onClick={this.copiar}>Copiar erro</button>
      </div>
    );
  }
}
