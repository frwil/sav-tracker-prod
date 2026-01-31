<?php
// src/Entity/Observation.php

namespace App\Entity;

use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\Post;
use Doctrine\DBAL\Types\Types;
use ApiPlatform\Metadata\Patch;
use Doctrine\ORM\Mapping as ORM;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\GetCollection;
use App\Repository\ObservationRepository;
use App\Validator\Constraints as AppAssert;
use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use Doctrine\Common\Collections\ArrayCollection;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use Symfony\Component\Serializer\Attribute\Groups;
use Doctrine\Common\Collections\Collection;
use Symfony\Component\Serializer\Attribute\SerializedName;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use App\Entity\ObservationPhoto; // ✅ Ajouter l'import
use Symfony\Component\HttpFoundation\File\File;

#[ORM\Entity(repositoryClass: ObservationRepository::class)]
#[ORM\HasLifecycleCallbacks]
#[UniqueEntity(
    fields: ['visit', 'flock'],
    message: "Une observation a déjà été saisie pour cette bande lors de cette visite."
)]
#[AppAssert\ConsistentObservationDate]
#[ApiResource(
    operations: [
        new Get(),
        new GetCollection(),
        new Post(
            securityPostDenormalize: "is_granted('OBSERVATION_CREATE', object)"
        ),
        new Patch(
            security: "is_granted('OBSERVATION_EDIT', object)"
        )
    ],
    normalizationContext: ['groups' => ['observation:read']],
    denormalizationContext: ['groups' => ['observation:write']]
)]
#[ApiFilter(SearchFilter::class, properties: [
    'visit' => 'exact',
    'visit.technician' => 'exact', // Indispensable pour les stats "Santé du Parc" par technicien
    'flock' => 'exact'
])]
// Permet de filtrer par date d'observation (pour les périodes de stats)
#[ApiFilter(DateFilter::class, properties: ['observedAt'])]
// Permet de trier (ex: les plus récentes en premier)
#[ApiFilter(OrderFilter::class, properties: ['observedAt' => 'DESC', 'createdAt' => 'DESC'])]
class Observation
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['observation:read', 'visit:read'])]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'observations')]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private ?Visit $visit = null;

    // Lien vers la Bande concernée (Indispensable pour savoir de quoi on parle)
    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private ?Flock $flock = null;

    // --- CHAMPS COMMUNS A TOUTES LES SPECULATIONS ---

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private ?string $concerns = null; // Préoccupations du client

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private ?string $observation = null; // Observations de la visite (Analyse)

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private ?string $recommendations = null; // Recommandations du technicien

    /**
     * Liste des problèmes détectés durant cette observation.
     */
    #[ORM\OneToMany(mappedBy: 'detectedIn', targetEntity: Problem::class, cascade: ['persist', 'remove'])]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private Collection $detectedProblems;

    #[ORM\OneToMany(mappedBy: 'resolvedIn', targetEntity: Problem::class)]
    #[Groups(['observation:read', 'observation:write'])]
    private Collection $resolvedProblems;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private ?string $generalComment = null; // Commentaire général

    // --- DONNEES SPECIFIQUES (JSON) ---
    // C'est ici que l'on stockera : Poids, Mortalité, Aliment, Densité, etc.
    // La structure du JSON changera selon la spéculation (Poisson vs Porc)
    #[ORM\Column(type: Types::JSON, options: ['jsonb' => true])]
    #[Groups(['observation:read', 'observation:write', 'visit:read'])]
    private array $data = [];

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE, updatable: false)]
    #[Groups(['observation:read', 'visit:read'])]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: Types::DATETIME_MUTABLE)] // Mutable car peut être ajustée si besoin
    #[Groups(['observation:read', 'observation:write', 'visit:read', 'flock:read'])] // 'write' autorisé !
    private ?\DateTimeInterface $observedAt = null;

    #[ORM\OneToMany(mappedBy: 'observation', targetEntity: ObservationPhoto::class, cascade: ['persist', 'remove'])]
    #[Groups(['observation:read'])]
    private Collection $photos;

    #[Groups(['observation:read', 'visit:read'])]
    #[SerializedName('hasInventory')]
    public function hasInventory(): bool
    {
        return !empty($this->data['inventory']);
    }

    #[ORM\PrePersist]
    public function setCreatedAtValue(): void
    {
        // Le serveur marque toujours l'heure de réception
        $this->createdAt = new \DateTimeImmutable();

        // Si le mobile n'a pas envoyé de date (ex: bug), on met la date serveur par défaut
        if ($this->observedAt === null) {
            $this->observedAt = new \DateTime();
        }
    }

    public function __construct()
    {
        $this->detectedProblems = new ArrayCollection();
        $this->resolvedProblems = new ArrayCollection();
        $this->photos = new ArrayCollection();
        // Si vous aviez déjà un constructeur, ajoutez juste la ligne ci-dessus dedans.
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getVisit(): ?Visit
    {
        return $this->visit;
    }
    public function setVisit(?Visit $visit): self
    {
        $this->visit = $visit;
        return $this;
    }

    public function getFlock(): ?Flock
    {
        return $this->flock;
    }
    public function setFlock(?Flock $flock): self
    {
        $this->flock = $flock;
        return $this;
    }

    public function getConcerns(): ?string
    {
        return $this->concerns;
    }
    public function setConcerns(?string $concerns): self
    {
        $this->concerns = $concerns;
        return $this;
    }

    public function getObservation(): ?string
    {
        return $this->observation;
    }
    public function setObservation(?string $observation): self
    {
        $this->observation = $observation;
        return $this;
    }

    public function getRecommendations(): ?string
    {
        return $this->recommendations;
    }
    public function setRecommendations(?string $recommendations): self
    {
        $this->recommendations = $recommendations;
        return $this;
    }

    /**
     * @return Collection<int, Problem>
     */
    public function getDetectedProblems(): Collection
    {
        return $this->detectedProblems;
    }

    public function addDetectedProblem(Problem $problem): self
    {
        if (!$this->detectedProblems->contains($problem)) {
            $this->detectedProblems->add($problem);
            $problem->setDetectedIn($this);
        }
        return $this;
    }

    public function removeDetectedProblem(Problem $problem): self
    {
        if ($this->detectedProblems->removeElement($problem)) {
            // set the owning side to null (unless already changed)
            if ($problem->getDetectedIn() === $this) {
                $problem->setDetectedIn(null);
            }
        }
        return $this;
    }

    /** @return Collection<int, Problem> */
    public function getResolvedProblems(): Collection
    {
        return $this->resolvedProblems;
    }

    public function addResolvedProblem(Problem $problem): self
    {
        if (!$this->resolvedProblems->contains($problem)) {
            $this->resolvedProblems->add($problem);
            $problem->setResolvedIn($this); // Ça mettra automatiquement le statut à resolved
        }
        return $this;
    }

    public function removeResolvedProblem(Problem $problem): self
    {
        if ($this->resolvedProblems->removeElement($problem)) {
            if ($problem->getResolvedIn() === $this) {
                $problem->setResolvedIn(null);
            }
        }
        return $this;
    }
    public function getGeneralComment(): ?string
    {
        return $this->generalComment;
    }
    public function setGeneralComment(?string $generalComment): self
    {
        $this->generalComment = $generalComment;
        return $this;
    }

    public function getData(): array
    {
        return $this->data;
    }
    public function setData(array $data): self
    {
        $this->data = $data;
        return $this;
    }

    public function getCreatedAt(): ?\DateTimeImmutable
    {
        return $this->createdAt;
    }
    public function getObservedAt(): ?\DateTimeInterface
    {
        return $this->observedAt;
    }
    public function setObservedAt(\DateTimeInterface $observedAt): self
    {
        $this->observedAt = $observedAt;
        return $this;
    }

    public function getPhotos(): Collection
    {
        return $this->photos;
    }
    #[SerializedName('newPhotos')]
    #[Groups(['observation:write'])]
    public function setNewPhotos(array $newPhotos): self
    {
        foreach ($newPhotos as $photoData) {
            // $photoData = ['content' => 'base64string...', 'filename' => 'photo.jpg']
            if (empty($photoData['content'])) continue;

            // Décodage du Base64
            $data = explode(',', $photoData['content']);
            $content = base64_decode(end($data));

            // Génération nom de fichier unique
            $filename = uniqid('obs_') . '.jpg';
            $path = 'uploads/observations/' . $filename; // Assurez-vous que ce dossier existe dans /public

            // Écriture du fichier sur le disque
            // Note: En prod, utilisez un Service Symfony, ici on fait simple pour l'exemple
            file_put_contents($path, $content);

            // Création de l'entité Photo
            $photo = new ObservationPhoto();
            $photo->contentUrl = '/uploads/observations/' . $filename;
            $photo->setObservation($this);

            $this->photos->add($photo);
        }
        return $this;
    }

    public function __toString(): string
    {
        return 'Observation #' . $this->id . ' - Bande: ' . ($this->flock ? $this->flock->getName() : 'N/A') . ' - Visite #' . ($this->visit ? $this->visit->getId() : 'N/A');
    }
}
