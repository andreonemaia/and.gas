# and.gas | Ethereum Gas Tracker

Um utilitário minimalista em formato de extensão para Chrome projetado para monitorar as taxas da rede Ethereum (ProposeGasPrice) em tempo real. Desenvolvido com foco absoluto em performance, sem frameworks pesados, rodando silenciosamente em background para entregar notificações push cirúrgicas.

> **Nota do Projeto:** Este sistema foi desenvolvido como trabalho de conclusão de pós-graduação e projetado para integrar o portfólio de soluções técnicas da **and.verso**.

![Captura de tela da interface do and.gas demonstrando o design monocromático](screenshot.png)

## ⚙️ Arquitetura e Tecnologias

A arquitetura foi desenhada priorizando a leveza e as diretrizes de segurança modernas dos navegadores, separando claramente a camada de interface (UI) da lógica de rede e armazenamento.

* **Core:** Manifest V3.
* **Stack:** Vanilla JavaScript, HTML5 e CSS3 (Sem dependências externas).
* **APIs Nativas:** `chrome.alarms`, `chrome.storage.local`, `chrome.notifications`.
* **Data Source:** Etherscan API (V2).

## 📂 Estrutura do Código

```text
and.gas/
├── manifest.json          # Configurações Manifest V3 e permissões estritas
├── background.js          # Service Worker (Ciclo de alarmes, fetch e push)
├── icons/                 # Identidade visual 
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── popup/
    ├── popup.html         # Estrutura da interface minimalista
    ├── popup.css          # Estilização monocromática e de alto contraste
    └── popup.js           # Lógica de interação e mensageria
```

## 🚀 Como testar localmente

Para rodar a extensão no seu ambiente de desenvolvimento, siga os passos abaixo:

### 1. Configuração da API
1. Crie uma chave de API gratuita no [Etherscan Developer Portal](https://etherscan.io/myapikey).
2. Abra o arquivo `background.js` e insira sua chave gerada (Padrão V2):
```js
const ETHERSCAN_API_KEY = "SUA_API_KEY_AQUI";
```

### 2. Instalação no Chrome
1. Acesse `chrome://extensions/` no seu navegador.
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta `and.gas`.
4. Fixe a extensão na barra de ferramentas.

### 3. Validação de Funcionalidades
* **Monitoramento:** Ao abrir o popup, a extensão fará a leitura imediata do gas atual. Você pode forçar novas leituras usando o ícone de atualização `↻`.
* **Notificações Push:** Defina um limite em Gwei (maior que o gas atual para testes rápidos) e clique em **Salvar Alerta**. Aguarde o ciclo de checagem (2 minutos) para receber a notificação do sistema. *A extensão possui um cooldown inteligente de 15 minutos entre alertas para evitar spam.*

## 📊 Matriz de Requisitos (Contexto Acadêmico)

| Requisito do Projeto | Implementação Técnica |
| :--- | :--- |
| **Padrão Moderno** | Adoção estrita do `manifest.json` V3. |
| **Performance** | Ausência de frameworks; uso exclusivo de Vanilla JS. |
| **Tarefas em Background** | Uso do `chrome.alarms` configurado com `periodInMinutes: 2`. |
| **Consumo Web3** | Fetch assíncrono na API V2 da Etherscan (`module=gastracker`). |
| **Persistência de Dados** | Armazenamento de preferências via `chrome.storage.local`. |
| **Feedback ao Usuário** | Alertas do sistema via `chrome.notifications.create()`. |
| **UX/UI** | Interface limpa com design system monocromático da and.verso. |

---
Desenvolvido por **and.verso**. Distribuído sob a licença MIT.