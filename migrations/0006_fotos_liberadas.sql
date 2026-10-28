-- 0006 — Fotos do catálogo importado liberadas (28/10/2026).
-- Os fornecedores autorizaram o uso das fotos de produto no site: todas
-- passam a ser públicas (product_images.licensed = 1). O link da página de
-- origem de cada cadastro deixa de ser guardado: o site e o painel mostram
-- só o produto. (source/source_id continuam, internos, para uma nova
-- importação não duplicar cadastros.)
UPDATE product_images SET licensed = 1 WHERE licensed = 0;
UPDATE products SET source_url = NULL WHERE source_url IS NOT NULL;
