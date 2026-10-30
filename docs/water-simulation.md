# Water Simulation — sorun analizi ve düzeltmeler

Dosya: `js/games/water.js`. Izgara 64×96 hücre, 60 Hz sabit adım. Her sıvı hücresinin yoğunluğu, hızı (`vx`, `vy`) ve kesirli kalanı (`rx`, `ry`) var.

## Nasıl ölçüldü

Headless Edge'de oyunu yükleyen bir test sayfası, `requestAnimationFrame`'i elle sürerek her kareyi tam olarak bir tick ilerletti. Sonra canvas piksellerini okudu:

- **boş satır / sütun**: nozül ile akışın ucu arasında hiç sıvı pikseli olmayan satırlar (dikey akış) veya sütunlar (yan jet)
- **maxOffset**: dikey akışta bir sıvı pikselinin nozül sütunundan en fazla kaç hücre saptığı
- **raw**: hareket izi kapalı, yani sadece gerçek hücreler. **görsel**: oyuncunun gördüğü.

İç durum gerektiren kontroller için (dökülen ve sahnedeki hücre sayısı, hız kaybı olayları) aynı kaynak test sırasında enstrümante edildi.

## Bulunan sorunlar

| # | Belirti | Kök neden | Düzeltme |
|---|---------|-----------|----------|
| 1 | Akış havada yanlara savruluyor | Kesirli hızı henüz bir tam hücreye ulaşmayan hücre bu tick hareket etmiyordu. Kod bunu "yere oturdu" sanıp çapraz kayma ve yayılma kurallarını uyguluyordu. | Dinlenme kuralları sadece hücre gerçekten bir şeyin üstündeyse çalışıyor: altında duvar ya da duran sıvı olmalı. Altında hâlâ akan sıvı varsa hücre havada sayılıyor. |
| 2 | Akış nozülden geniş çıkıyor, sağa sola dağılıyor | Her hücreye iki eksende de rastgele hız ekleniyordu (`spray`), ayrıca hücreler sabit 5 şeride yayılıyordu. | Rastgele sapma kaldırıldı. Şerit sayısı akış miktarından hesaplanıyor ve şeritler jetin ana eksenine dik diziliyor. |
| 3 | Akış artınca boş pikseller beliriyor | v hücre/tick hızla giden bir şerit, her tick v hücre dökmezse kopuyor. Eskiden akış ne olursa olsun 5 şeride serpiştiriliyordu. | Akış arttıkça nozül genişliyor (şerit sayısı = ⌈debi / hız⌉). Her şerit en fazla hızı kadar hücre döküyor. |
| 4 | Akış kümeler halinde kopuyor (3–4 satırlık boşluk, sonra yığın) | Yeni hücreler tam sayı konumda ve sıfır kalanla doğuyordu. Hareket halindeki hücreler ise konumu "taban + 0…1 kalan" olarak tutuyor. İki kural çakışınca yeni hücre öndekinin karesine denk geliyor, emisyon tıkanıp birikmiş halde boşalıyordu. | Tick içinde erken dökülen hücre daha ileri, kesirli kalanıyla birlikte yerleştiriliyor. Konum hareket koduyla aynı kuralla (`Math.trunc` + kalan) bölünüyor. |
| 5 | Dökülen hücrelerin yaklaşık %40'ı kayboluyor | `emit()` adımın başında çalışıyordu. Önceki tick'in hücreleri henüz yerinden kalkmadan yenileri onların yerine konmaya çalışılıyor, dolu kare bulununca hücre siliniyordu. | `emit()` hareketten sonra çalışıyor. Kare doluysa nozüle doğru geri deneniyor, o da doluysa hücre bir sonraki tick'e kalıyor, artık silinmiyor. |
| 6 | Bir süre sonra havuz büyümüyor (600 → 900 karede 387 → 388 hücre) | Sıvıya çarpan hücre karşısındakinin *kayıtlı* hızını alıyordu. Sütun aslında hareket etmese de hızı ~1 görünüyordu, böylece "hâlâ düşüyor" sayılıp hiç yayılmıyor ve nozülü tıkıyordu. | Hücreler tick içinde "tıkalı" damgası alıyor: duvara ya da tıkalı sıvıya çarpıp hiç ilerleyemeyen veya dinlenmede yer bulamayan hücre. Tıkalı sıvıya çarpan hücre durur. |
| 7 | (6'nın ilk düzeltmesinin yan etkisi) Jetten düz aşağı damlayan kesikli çizgiler | İlk denemede "sırası geldi ama hareket etmedi" de tıkalı sayıldı. Kesirli hızı yüzünden bekleyen jet hücresinin arkasındakiler hızını kaybedip düşüyordu. | Tıkalılık sadece gerçek engelden (duvar/kenar veya kendisi tıkalı sıvı) yayılıyor. |
| 8 | Yukarı ve yana jetler kopuyor | Satırlar alttan üste tarandığı için öndeki hücre arkadakinden sonra işleniyordu. Arkadaki her tick öndekine takılıyordu. | Henüz işlenmemiş sıvıya takılan hücre ertelenip tarama bitince yeniden deneniyor. |
| 9 | Yoğunluk sıvıyı maviden beyaza çeviriyordu | Renk sabit maviden süte doğru karıştırılıyordu. | Tek renk: seçilen renk yoğunlukla koyulaşıyor (`shade`), havuzun derininde biraz daha koyu (`depthShade`). Renk seçici eklendi. |
| 10 | Yoğun sıvı katman oluşturmuyordu | Yoğunluk difüzyonu (`mix: 0.04`) havuzu birkaç saniyede homojenleştiriyordu. | `mix: 0.008`. Ağır sıvı hafifin altına çökerek ayrı kalıyor. |
| 11 | Yayıcıyı yönlendirmek zor | Yön sadece açı barıyla değişiyordu. | Yayıcı aracında noktaya basıp sürüklemek taşıyor, başka bir yere basıp sürüklemek nozülü o noktaya çeviriyor. Açı barı da güncelleniyor. |

## Ölçüm sonuçları

Dikey akış (açı 0°):

| Senaryo | Önce: boş satır | Önce: maxOffset | Sonra (raw): boş satır | Sonra (görsel): boş satır | Sonra: maxOffset |
|---------|-----------------|-----------------|------------------------|---------------------------|------------------|
| akış 40, basınç 40 | 20 / 38 | 2 | 11 / 44 | **0** | **0** |
| akış 100, basınç 40 | 9 / 38 | 6 | 17 / 44 | **0** | 1 (3 şerit) |
| akış 100, basınç 100 | 31 / 56 | 6 | 16 / 49 | **0** | 1 (2 şerit) |

Yan jet (akış 60, basınç 100, açı 90°): önce 19 satır kalınlığa dağılıyordu. Sonra 1–2 satır kalınlıkta, görselde 0 boş sütun var.

Debi (akış 60, basınç 40, 600 kare): dökülen hücre = sahnedeki hücre, kayıp yok. Gerçekleşen debi ayarın yaklaşık %82'si: nozül önü doluyken bekleyen hücreler var.

## Bilinçli olarak kalanlar

- **Raw ölçümdeki tek satırlık boşluklar fiziksel.** Düşen sıvı hızlanır, sabit debide aralar açılır. Gerçekte akış incelir, ama 1 piksellik akış daha fazla incelemez, ancak noktalara ayrılır. Görselde her hızlı hücre o tick'te katettiği yolu iz olarak (`trail`) çiziyor, böylece akış tek çizgi okunuyor. İz sadece çizimdir, fiziğe etkisi yok.
- **Neredeyse dikey yukarı fışkırtma (≈170°)** düşen sıvı yükselen jetin üstüne yağdığı için bulut gibi görünür. Eğik açılarda (≈145°) temiz bir yay çiziyor.
- Havuz yüzeyinde 1 piksellik basamaklar kalabiliyor (hücresel sıvının doğası). Yüzey parlaması sadece duran sıvıda çiziliyor, jet beneklenmesin diye.

## Ayar referansı (`CFG`)

`flowMax` debi, `speedMin` / `speedMax` nozül hızı, `lanes` en geniş nozül, `rest` "hâlâ akıyor" eşiği, `friction` dinlenmedeki yatay sürtünme, `mix` yoğunluk difüzyonu, `shade` / `depthShade` koyulaşma, `trail` iz uzunluğu, `grab` yayıcıyı tutma yarıçapı.
