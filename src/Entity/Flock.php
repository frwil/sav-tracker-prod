<?php

namespace App\Entity;

use App\Entity\Building;
use App\Entity\Standard;

use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\Post;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Delete;
use Doctrine\ORM\Mapping as ORM;
use ApiPlatform\Metadata\ApiFilter;
use App\Repository\FlockRepository;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\OpenApi\Model\Schema;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\OpenApi\Model\MediaType;
use ApiPlatform\OpenApi\Model\Operation;
use App\Controller\CloseFlockController;
use ApiPlatform\OpenApi\Model\RequestBody;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping\HasLifecycleCallbacks;
use App\Validator\Constraints\BuildingAvailable;
use Doctrine\Common\Collections\ArrayCollection;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Serializer\Attribute\SerializedName;

// src/Entity/Flock.php
#[ORM\Entity(repositoryClass: FlockRepository::class)]
#[HasLifecycleCallbacks]
#[ApiResource(
    normalizationContext: ['groups' => ['flock:read']],
    denormalizationContext: ['groups' => ['flock:write']],
    operations: [
        new Get(),
        new GetCollection(),
        new Post(),
        new Patch(),
        // Notre nouvelle opération de clôture :
        new Post(
            uriTemplate: '/flocks/{id}/close',
            controller: CloseFlockController::class,
            openapi: new Operation(
                summary: 'Clôturer une bande',
                description: 'Marque la bande comme terminée et définit la date de fin automatiquement.',
                requestBody: new RequestBody(
                    content: new \ArrayObject([
                        'application/json' => new MediaType(
                            schema: new Schema()
                        )
                    ])
                )
            ),
            name: 'close_flock'
        ),
        new Delete()
    ]
)]
#[BuildingAvailable] // Contrainte personnalisée
#[ApiFilter(SearchFilter::class, properties: ['building.customer' => 'exact'])]
class Flock
{
    // public const FEED_STRATEGY_INDUSTRIAL = 'INDUSTRIAL'; // Branche A
    // public const FEED_STRATEGY_SELF_MIX = 'SELF_MIX';     // Branche B
    // public const FEED_STRATEGY_THIRD_PARTY = 'THIRD_PARTY'; // Branche C  

    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['visit:read', 'flock:read', 'building:read'])]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    #[Groups(['visit:read', 'flock:read', 'building:read', 'flock:write'])]
    private ?string $name = null;

    #[ORM\Column]
    #[Groups(['flock:write', 'flock:read', 'visit:read'])]
    private ?int $subjectCount = null; // <= capacity du bâtiment

    #[ORM\Column(type: 'datetime')]
    #[Groups(['visit:read', 'flock:read', 'flock:write'])]
    private ?\DateTimeInterface $startDate = null;

    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTimeInterface $endDate = null;

    #[ORM\Column]
    #[Groups(['visit:read', 'flock:read', 'flock:write'])]
    private bool $closed = false;

    #[ORM\Column(type: 'boolean', options: ['default' => true])]
    #[Groups(['flock:read', 'flock:write', 'visit:read'])]
    private ?bool $activated = true;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['visit:read', 'flock:read', 'flock:write'])]
    private ?Speculation $speculation = null; // Choix unique

    #[ORM\ManyToOne(inversedBy: 'flocks')]
    #[ORM\JoinColumn(nullable: false)]
    #[Groups(['flock:write', 'flock:read', 'visit:read'])]
    private ?Building $building = null;

    #[ORM\OneToMany(mappedBy: 'flock', targetEntity: Observation::class)]
    #[Groups(['visit:read', 'flock:read'])]
    private Collection $observations;

    #[ORM\ManyToOne]
    #[Groups(['flock:read', 'flock:write', 'visit:read'])]
    private ?Standard $standard = null;

    #[ORM\OneToMany(mappedBy: 'flock', targetEntity: FlockFeedHistory::class, cascade: ['persist', 'remove'])]
    #[ORM\OrderBy(['createdAt' => 'DESC'])] // Le plus récent en premier
    #[Groups(['flock:read', 'flock:write'])]
    private Collection $feedHistory;

    public function __construct()
    {
        $this->observations = new ArrayCollection();
        $this->feedHistory = new ArrayCollection();
    }

    // Getters/Setters...

    public function getId(): ?int
    {
        return $this->id;
    }
    public function getName(): ?string
    {
        return $this->name;
    }
    public function setName(string $name): self
    {
        $this->name = $name;
        return $this;
    }
    public function getSubjectCount(): ?int
    {
        return $this->subjectCount;
    }
    public function setSubjectCount(?int $subjectCount): self
    {
        $this->subjectCount = $subjectCount;
        return $this;
    }
    public function getStartDate(): ?\DateTimeInterface
    {
        return $this->startDate;
    }
    public function setStartDate(?\DateTimeInterface $startDate): self
    {
        $this->startDate = $startDate;
        return $this;
    }
    public function getEndDate(): ?\DateTimeInterface
    {
        return $this->endDate;
    }
    public function setEndDate(?\DateTimeInterface $endDate): self
    {
        $this->endDate = $endDate;
        return $this;
    }
    public function isClosed(): bool
    {
        return $this->closed;
    }
    public function setClosed(bool $closed): self
    {
        $this->closed = $closed;
        return $this;
    }

    public function isActivated(): ?bool
    {
        return $this->activated;
    }
    public function setActivated(bool $activated): self
    {
        $this->activated = $activated;
        return $this;
    }
    public function getSpeculation(): ?Speculation
    {
        return $this->speculation;
    }
    public function setSpeculation(?Speculation $speculation): self
    {
        $this->speculation = $speculation;
        return $this;
    }
    public function getBuilding(): ?Building
    {
        return $this->building;
    }
    public function setBuilding(?Building $building): self
    {
        $this->building = $building;
        return $this;
    }
    /**
     * @return Collection<int, Observation>
     */
    public function getObservations(): Collection
    {
        return $this->observations;
    }
    public function setObservations(Collection $observations): self
    {
        $this->observations = $observations;
        return $this;
    }

    public function getStandard(): ?Standard
    {
        return $this->standard;
    }

    public function setStandard(?Standard $standard): self
    {
        $this->standard = $standard;
        return $this;
    }

    /**
     * @return Collection<int, FlockFeedHistory>
     */
    public function getFeedHistory(): Collection
    {
        return $this->feedHistory;
    }

    public function addFeedHistory(FlockFeedHistory $feedHistory): self
    {
        if (!$this->feedHistory->contains($feedHistory)) {
            $this->feedHistory->add($feedHistory);
            $feedHistory->setFlock($this);
        }
        return $this;
    }

    public function removeFeedHistory(FlockFeedHistory $feedHistory): self
    {
        if ($this->feedHistory->removeElement($feedHistory)) {
            // set the owning side to null (unless already changed)
            if ($feedHistory->getFlock() === $this) {
                $feedHistory->setFlock(null);
            }
        }
        return $this;
    }

    #[Groups(['flock:read', 'visit:read'])]
    #[SerializedName('feedStrategy')] // Expose ce champ dans le JSON
    public function getFeedStrategy(): ?string
    {
        // Récupère le dernier historique (grâce au OrderBy DESC)
        $lastHistory = $this->feedHistory->first();
        return $lastHistory ? $lastHistory->getNewStrategy() : null;
    }

    #[Groups(['flock:read', 'visit:read'])]
    #[SerializedName('feedFormula')]
    public function getFeedFormula(): ?string
    {
        $lastHistory = $this->feedHistory->first();
        return $lastHistory ? $lastHistory->getNewFormula() : null;
    }

    public function __toString(): string
    {
        return $this->name ?? '';
    }
}
