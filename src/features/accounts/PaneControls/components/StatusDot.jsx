
// Bolinha: verde = ligado, vermelho = desligado
export default function StatusDot({ ligado }) {
  return (
    <span
      className={`controls__dot ${ligado ? 'is-on' : 'is-off'}`}
      title={ligado ? 'Funcionando' : 'Desligado'}
      aria-label={ligado ? 'Funcionando' : 'Desligado'}
    />
  );
}
