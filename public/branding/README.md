# Logo oficial

O arquivo da logo exibida na conversa ainda não foi disponibilizado ao workspace.
Para preservar a identidade original, nenhum desenho substituto foi produzido.

Salve o PNG original como `next-gen-ads.png` nesta pasta e altere `brand.json` para:

```json
{ "logo": "/branding/next-gen-ads.png" }
```

O componente `src/components/brand.tsx` é compartilhado pela sidebar, login e
convite. Ele apresenta a imagem original com `object-fit: contain`, sem filtros,
recoloração, distorção ou corte. O fundo preto do arquivo integra o dark mode.
