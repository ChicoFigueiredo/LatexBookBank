# Validação do scan estrutural

*Fase 10 do [prompt 03](../prompts/) · issue #221 · gerado por `tests/scan-corpus.test.ts` em 2026-09-23.*
Os números abaixo são **medidos**, pelo scan determinístico (sem IA e sem reconhecimento),
sobre os PDFs reais desta máquina. O corpus não está no git (D48); a lista fica em
`SCAN_CORPUS`. Quem regrava é o teste, não uma pessoa.

## Provas (§57)

Colunas: páginas · questões achadas / esperadas · completas · suspeitas · incompletas · sem
evidência textual (alternativas em imagem) · com outra questão dentro · com alternativa
faltando · com mais de uma âncora · que atravessam página · marcadas com língua · tempo.

| Caderno | Pág. | Achadas | Compl. | Susp. | Incompl. | Sem evid. | Invasão | Alt. falt. | Multi-âncora | Multi-pág. | Língua | Tempo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ENEM 2017 · 1º dia (azul) | 32 | 95 / 95 | 95 | 0 | 0 | 0 | 0 | 0 | 35 | 15 | 10 | 1.9 s |
| ENEM 2017 · 2º dia (azul) | 32 | 90 / 90 | 88 | 0 | 0 | 2 | 0 | 2 | 29 | 19 | 0 | 1.1 s |
| ENEM 2018 · 1º dia (azul) | 32 | 95 / 95 | 95 | 0 | 0 | 0 | 0 | 0 | 34 | 18 | 10 | 0.5 s |
| ENEM 2018 · 2º dia (azul) | 32 | 90 / 90 | 87 | 0 | 0 | 3 | 0 | 3 | 31 | 17 | 0 | 0.6 s |
| ENEM 2019 · 1º dia (azul) | 32 | 95 / 95 | 95 | 0 | 0 | 0 | 0 | 0 | 32 | 17 | 10 | 1.0 s |
| ENEM 2019 · 2º dia (azul) | 32 | 90 / 90 | 89 | 0 | 0 | 1 | 0 | 1 | 33 | 19 | 0 | 0.7 s |
| ENEM 2023 · 2º dia (azul) | 32 | 90 / 90 | 88 | 0 | 0 | 2 | 0 | 2 | 33 | 20 | 0 | 1.2 s |
| ENEM 2024 · 2º dia (azul) | 32 | 90 / 90 | 86 | 0 | 0 | 4 | 0 | 4 | 31 | 18 | 0 | 1.7 s |
| ProfMat ENA 2023 (com soluções) (exam-v1) | 16 | 30 / 30 | — | — | — | — | — | — | 1 | 1 | — | 0.2 s |

**No total**: 735 de 735 questões localizadas em 8 cadernos; 723 completas (98,4%), 12 com alternativas sem texto (em imagem, 1,6%) e 0 invasões. A referência é o segmentador do TRI, que chegou a 98,3% de completas e zero invasões em 2.775 questões de 30 cadernos (auditoria de 2026-09-06).

O `exam-v1` não tem diagnóstico por questão: é a estimativa da captura, página a página, e o
30 de 30 do ENA é provado pelo teste de regressão sobre as páginas reais.

## Livros (§58)

### Curso de Análise Vol. 1 (Elon Lages Lima)

| Medida | Valor |
|---|---:|
| páginas analisadas | 447 |
| elementos encontrados | 956 |
| partes · capítulos · seções · subseções | 0 · 10 · 59 · 0 |
| exemplos | 107 |
| blocos de exercícios · exercícios · itens | 10 · 447 · 67 |
| trechos de teoria | 162 |
| figuras | 57 |
| âncoras · itens com mais de uma · que atravessam página | 1324 · 195 · 195 |
| baixa confiança (< 0,70) | 9 |
| sugeridos para aprovação em lote | 890 |
| precisam de reconhecimento matemático | 677 |
| deslocamento PDF − impressa | 13 |
| avisos | 0 |
| chamadas à IA · ao reconhecimento | 0 · 0 (medição determinística) |
| tempo | 5.3 s |

Capítulos achados: 1 Conjuntos e Funções (p. 14) · 2 Conjuntos Finitos, Enumeráveis e Não-Enumeráveis (p. 45) · 3 Números Reais (p. 72) · 4 Seqüências e Séries de Números Reais (p. 112) · 5 Topologia da Reta (p. 174) · 6 Limites de Funções (p. 208) · 7 Funções Contínuas (p. 235) · 8 Derivadas (p. 268) · 9 Integral de Riemann (p. 315) · 10 Seqüências e Séries de Funções (p. 374).

### Fundamentos de Matemática Elementar vol. 1 (Iezzi)

| Medida | Valor |
|---|---:|
| páginas analisadas | 420 |
| elementos encontrados | 4223 |
| partes · capítulos · seções · subseções | 0 · 11 · 83 · 159 |
| exemplos | 0 |
| blocos de exercícios · exercícios · itens | 71 · 562 · 2334 |
| trechos de teoria | 172 |
| figuras | 470 |
| âncoras · itens com mais de uma · que atravessam página | 4653 · 226 · 218 |
| baixa confiança (< 0,70) | 0 |
| sugeridos para aprovação em lote | 3753 |
| precisam de reconhecimento matemático | 2028 |
| deslocamento PDF − impressa | 8 |
| avisos | 2 |
| chamadas à IA · ao reconhecimento | 0 · 0 (medição determinística) |
| tempo | 15.4 s |

Capítulos achados: I Noções de lógica (p. 9) · II Conjuntos (p. 26) · III Conjuntos numéricos (p. 48) · IV Relações (p. 72) · V Introdução às funções (p. 87) · VI Função constante Função afim (p. 105) · VII Funções quadráticas (p. 145) · VIII Função modular (p. 192) · IX Outras funções elementares (p. 213) · X Função composta Função inversa (p. 220) · ? Questões de vestibulares (p. 321).

Avisos:

- Zona "respostas dos exercícios" (a partir da página 278) não foi varrida: é gabarito, não estrutura.
- Zona "respostas dos vestibulares" (a partir da página 412) não foi varrida: é gabarito, não estrutura.

## O que este relatório não mede

- A correção de cada item contra um gabarito humano: não há, ainda, revisão registrada sobre
  este corpus. A proposta guarda o retrato do que o scan propôs ao lado do que a pessoa
  corrigir (§59); a comparação fica possível assim que houver revisões.
- O reconhecimento matemático e o desempate por IA, que dependem do modelo configurado e
  entram só por pedido.
- PDFs digitalizados (sem camada de texto): o corpus atual não tem nenhum.
