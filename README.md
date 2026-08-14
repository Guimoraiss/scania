# LCB Capacity Analytics

Painel de analise de capacidade do Logistics Center Brazil (LCB).

## GitHub Pages

O frontend esta na raiz do repositorio e pode ser publicado diretamente:

1. No GitHub, abra **Settings > Pages**.
2. Em **Build and deployment**, escolha **Deploy from a branch**.
3. Selecione a branch **main**, a pasta **/(root)** e clique em **Save**.
4. Aguarde a publicacao em `https://guimoraiss.github.io/scania/`.

O botao **Usar Dados de Exemplo** funciona apenas com os arquivos estaticos.
Upload e simulacao de Excel dependem do backend FastAPI, que nao pode rodar no
GitHub Pages. Depois de hospedar o backend, informe sua URL em `config.js`.

## Execucao local

Frontend:

```powershell
python -m http.server 5500
```

Backend (em outro terminal):

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Abra `http://localhost:5500` no navegador.

Nunca envie `backend/.env` ao GitHub. Use esse arquivo somente para as
credenciais locais do backend.

## Backend no Render

O arquivo `render.yaml` configura automaticamente o backend FastAPI no plano
gratuito. No Render, crie um **Blueprint**, conecte este repositorio e confirme
o servico `lcb-capacity-api`. Depois do deploy, copie a URL `onrender.com` para
`config.js` e envie a alteracao ao GitHub.
