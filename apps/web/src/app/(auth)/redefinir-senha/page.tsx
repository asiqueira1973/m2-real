/** Redefinir a senha (seção 6.1): aberta pelo link do e-mail, com a sessão de recuperação. */
import { redefinirSenha } from "../acoes";
import { FormularioAuth } from "../formulario";

export default function RedefinirSenhaPage() {
  return (
    <>
      <h1 className="mb-4 text-base font-medium">Criar uma senha nova</h1>
      <FormularioAuth
        acao={redefinirSenha}
        botao="Salvar senha"
        campos={[
          { nome: "senha", rotulo: "Senha nova", tipo: "password", autocomplete: "new-password" },
          { nome: "confirmacao", rotulo: "Repita a senha", tipo: "password", autocomplete: "new-password" },
        ]}
      />
    </>
  );
}
